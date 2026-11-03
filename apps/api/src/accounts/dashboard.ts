import {
  adminDashboardSchema,
  adminIpoInspectionSchema,
  adminSyncHistorySchema,
  timestampSchema,
  type AdminDashboard,
} from "@ipo-singh/contracts";
import type { CacheHandle } from "../cache/connection.ts";
import type { AppConfig } from "../config/env.ts";
import { effectiveIpoGuruRequestLimits } from "../config/ipoguru.ts";
import { catalogueReadLimit } from "../db/repositories.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import type { IpoRecord } from "../db/records.ts";
import { alertMetricsSnapshot } from "../notifications/metrics.ts";
import { validationFailureCount } from "../ops/validation.ts";
import type { IpoGuruClient } from "../providers/ipo-guru/client.ts";

const resourcePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function remaining(used: number | null, limit: number): number | null {
  if (used === null) return null;
  return Math.max(0, limit - used);
}

function emptyRecords(): AdminDashboard["records"] {
  return {
    available: false,
    complete: false,
    total: null,
    mainboard: null,
    sme: null,
    open: null,
    upcoming: null,
    listed: null,
    closed: null,
    allotment: null,
    statusMissing: null,
  };
}

function countRecords(rows: readonly IpoRecord[]): AdminDashboard["records"] {
  const counts = {
    available: true,
    complete: rows.length < catalogueReadLimit,
    total: rows.length,
    mainboard: 0,
    sme: 0,
    open: 0,
    upcoming: 0,
    listed: 0,
    closed: 0,
    allotment: 0,
    statusMissing: 0,
  };
  for (const row of rows) {
    if (row.board === "mainboard") counts.mainboard += 1;
    if (row.board === "sme") counts.sme += 1;
    if (row.status === null) counts.statusMissing += 1;
    else counts[row.status] += 1;
  }
  return counts;
}

export async function buildAdminDashboard(input: {
  config: AppConfig;
  database: DatabaseHandle;
  cache: CacheHandle;
  now?: Date;
  ipoGuru?: IpoGuruClient;
}): Promise<AdminDashboard> {
  const now = input.now ?? new Date();
  const [database, cacheHealth, quota] = await Promise.all([
    input.database.check().catch(() => "unavailable" as const),
    input.cache.check().catch(() => "unavailable" as const),
    input.cache.quota.snapshot().catch(() => ({ minuteUsed: null, dayUsed: null })),
  ]);
  const metrics = input.cache.service.metrics();
  const providerName = input.config.provider?.primary ?? "not_configured";

  let records = emptyRecords();
  let sync: AdminDashboard["sync"] = { available: false, succeeded: null, failed: null, lastSuccessAt: null };
  if (input.database.store && database === "ok") {
    try {
      if (input.database.store.ipos.summarizeCounts) {
        const summary = await input.database.store.ipos.summarizeCounts();
        records = {
          available: true,
          complete: summary.complete,
          total: summary.total,
          mainboard: summary.mainboard,
          sme: summary.sme,
          open: summary.open,
          upcoming: summary.upcoming,
          listed: summary.listed,
          closed: summary.closed,
          allotment: summary.allotment,
          statusMissing: summary.statusMissing,
        };
      } else {
        const rows = await input.database.store.ipos.list();
        records = countRecords(rows);
      }
    } catch {
      records = emptyRecords();
    }
    if (input.config.provider) {
      try {
        const runs = await input.database.store.sync.findByProvider(input.config.provider.primary, now);
        let succeeded = 0;
        let failed = 0;
        let last: Date | null = null;
        // Only scan a bounded recent window for dashboard cards.
        for (const run of runs.slice(0, 200)) {
          if (run.status === "succeeded") {
            succeeded += 1;
            if (run.finishedAt && (!last || run.finishedAt.getTime() > last.getTime())) last = run.finishedAt;
          } else if (run.status === "failed") failed += 1;
        }
        sync = { available: true, succeeded, failed, lastSuccessAt: last ? last.toISOString() : null };
      } catch {
        sync = { available: false, succeeded: null, failed: null, lastSuccessAt: null };
      }
    }
  }

  let providerHealth: AdminDashboard["provider"]["health"] = providerName === "not_configured" ? "not_configured" : "ok";
  let lastFailure: AdminDashboard["provider"]["lastFailure"] = null;
  let vendorRemaining: number | null = null;
  if (input.ipoGuru) {
    try {
      const monitor = await input.ipoGuru.monitor();
      vendorRemaining = typeof monitor.vendor?.remaining === "number" ? monitor.vendor.remaining : null;
      if (monitor.lastFailure) {
        const observed = timestampSchema.safeParse(monitor.lastFailure.observedAt);
        const code = monitor.lastFailure.code;
        const safeCode = typeof code === "string" && /^[a-z0-9_]{1,80}$/.test(code) ? code : null;
        if (observed.success && Number.isInteger(monitor.lastFailure.httpStatus)) {
          lastFailure = { httpStatus: monitor.lastFailure.httpStatus, code: safeCode, observedAt: observed.data };
        }
        providerHealth = "unavailable";
      } else if (!monitor.enabled && providerName === "ipo-guru") {
        providerHealth = "not_configured";
      }
    } catch {
      providerHealth = "unavailable";
      vendorRemaining = null;
      lastFailure = null;
    }
  } else if (providerName === "ipo-guru" && !input.config.ipoGuru.enabled) {
    providerHealth = "not_configured";
  }

  const limits = effectiveIpoGuruRequestLimits({
    enabled: input.config.ipoGuru.enabled,
    minuteBudget: input.config.ipoGuru.minuteBudget,
    dailyBudget: input.config.ipoGuru.dailyBudget,
    requestsPerMinute: input.config.quota.requestsPerMinute,
    requestsPerDay: input.config.quota.requestsPerDay,
    reservedRequests: input.config.quota.reservedRequests,
  });
  const minuteRemaining = remaining(quota.minuteUsed, limits.requestsPerMinute);
  const dayRemaining = remaining(quota.dayUsed, limits.requestsPerDay);
  const alerts = alertMetricsSnapshot();

  let accounts: AdminDashboard["accounts"] = {
    available: false,
    member: null,
    admin: null,
    superAdmin: null,
    pending: null,
    active: null,
    suspended: null,
    closed: null,
  };
  if (input.database.accounts && database === "ok") {
    try {
      const [member, admin, superAdmin, pending, active, suspended, closed] = await Promise.all([
        input.database.accounts.countRole("member"),
        input.database.accounts.countRole("admin"),
        input.database.accounts.countRole("super-admin"),
        input.database.accounts.countStatus("pending"),
        input.database.accounts.countStatus("active"),
        input.database.accounts.countStatus("suspended"),
        input.database.accounts.countStatus("closed"),
      ]);
      accounts = { available: true, member, admin, superAdmin, pending, active, suspended, closed };
    } catch {
      accounts = { ...accounts, available: false };
    }
  }

  let watchlist: AdminDashboard["watchlist"] = { available: false, saved: null };
  if (input.database.watchlist && database === "ok") {
    try {
      watchlist = { available: true, saved: await input.database.watchlist.countAll() };
    } catch {
      watchlist = { available: false, saved: null };
    }
  }

  let stored: number | null = null;
  let storedAvailable = false;
  if (input.database.notifications && database === "ok") {
    try {
      stored = await input.database.notifications.countStored(now);
      storedAvailable = true;
    } catch {
      stored = null;
      storedAvailable = false;
    }
  }

  const warnings: AdminDashboard["warnings"] = [];
  if (database === "unavailable") warnings.push({ code: "database", message: "MongoDB is unavailable." });
  if (database === "not_configured") warnings.push({ code: "database", message: "MongoDB is not configured." });
  if (cacheHealth === "unavailable") warnings.push({ code: "cache", message: "Redis is unavailable." });
  if (cacheHealth === "not_configured") warnings.push({ code: "cache", message: "Redis is not configured." });
  if (sync.available && sync.failed !== null && sync.failed > 0) {
    warnings.push({ code: "sync_failures", message: "Synchronization has recorded failures." });
  }
  const validationFailures = validationFailureCount();
  if (validationFailures > 0) warnings.push({ code: "validation", message: "Data validation failures were recorded in this process." });
  if (lastFailure) warnings.push({ code: "provider_outage", message: "The provider reported a failed request." });
  if (dayRemaining === 0 || minuteRemaining === 0 || vendorRemaining === 0) {
    warnings.push({ code: "quota", message: "A provider quota has no remaining requests." });
  }

  return adminDashboardSchema.parse({
    observedAt: now.toISOString(),
    records,
    sync,
    provider: {
      name: providerName,
      ipoGuruEnabled: input.config.ipoGuru.enabled,
      health: providerHealth,
      lastFailure,
    },
    quota: {
      minuteUsed: quota.minuteUsed,
      minuteLimit: limits.requestsPerMinute,
      minuteRemaining,
      dayUsed: quota.dayUsed,
      dayLimit: limits.requestsPerDay,
      dayRemaining,
      reservedRequests: limits.reservedRequests,
      vendorRemaining,
    },
    cache: {
      health: cacheHealth,
      hits: metrics.hits,
      misses: metrics.misses,
      staleHits: metrics.staleHits,
      originLoads: metrics.originLoads,
      originFailures: metrics.originFailures,
      storeErrors: metrics.storeErrors,
    },
    database,
    validationFailures,
    accounts,
    watchlist,
    notifications: {
      created: alerts.created,
      duplicates: alerts.duplicates,
      skipped: alerts.skipped,
      failed: alerts.failed,
      lastFinishedAt: alerts.lastFinishedAt,
      storedAvailable,
      stored,
    },
    warnings: warnings.slice(0, 8),
  });
}

export async function listAdminIpos(input: {
  database: DatabaseHandle;
  query?: string;
}): Promise<{ complete: boolean; records: Array<{ slug: string; companyName: string | null; board: IpoRecord["board"]; status: IpoRecord["status"]; freshness: IpoRecord["source"]["freshness"]; fetchedAt: string }> }> {
  if (!input.database.store) return { complete: false, records: [] };
  const needle = input.query?.trim().toLowerCase() ?? "";
  let ipos: IpoRecord[];
  let complete: boolean;
  if (input.database.store.ipos.listForInspection) {
    ipos = await input.database.store.ipos.listForInspection({ query: needle, limit: 50 });
    complete = ipos.length < 50;
  } else {
    const all = await input.database.store.ipos.list();
    complete = all.length < catalogueReadLimit;
    ipos = all
      .filter((ipo) => needle.length === 0 || ipo.slug.includes(needle))
      .sort((left, right) => left.slug.localeCompare(right.slug))
      .slice(0, 50);
  }
  const companyIds = new Set(ipos.map((ipo) => ipo.companyId));
  const companies = await input.database.store.companies.list();
  const names = new Map(
    companies.filter((company) => companyIds.has(company.id)).map((company) => [company.id, company.name]),
  );
  const records = ipos.map((ipo) => ({
    slug: ipo.slug,
    companyName: names.get(ipo.companyId) ?? null,
    board: ipo.board,
    status: ipo.status,
    freshness: ipo.source.freshness,
    fetchedAt: ipo.source.fetchedAt.toISOString(),
  }));
  return adminIpoInspectionSchema.parse({ complete, records });
}

export async function listAdminSyncRuns(input: { database: DatabaseHandle; provider: AppConfig["provider"]; now?: Date }) {
  if (!input.database.store || !input.provider) return adminSyncHistorySchema.parse({ available: false, runs: [] });
  const runs = await input.database.store.sync.findByProvider(input.provider.primary, input.now ?? new Date());
  const visible = runs
    .filter((run) => resourcePattern.test(run.resource))
    .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
    .slice(0, 20)
    .map((run) => ({
      resource: run.resource,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      fetchedCount: run.fetchedCount,
      errorName: run.errorName,
    }));
  return adminSyncHistorySchema.parse({ available: true, runs: visible });
}
