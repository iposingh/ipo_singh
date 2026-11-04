import { createHash } from "node:crypto";
import type { Ipo } from "@ipo-singh/contracts";
import { istCalendarDate, resolveIpoLifecycle } from "@ipo-singh/core";
import type { CacheResource } from "../config/cache-policy.ts";
import type { SyncCategory, SyncPolicy } from "../config/sync-policy.ts";
import type { CacheService } from "../cache/service.ts";
import { CachePolicyError } from "../cache/errors.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import type { IpoRecord, SyncRunRecord } from "../db/records.ts";
import { QuotaExhaustedError, type QuotaGate } from "../providers/quota.ts";
import type { ProviderGateway } from "../providers/gateway.ts";
import type { ProviderKey } from "../providers/provider.ts";
import type { Logger } from "../shared/logger.ts";
import type { SyncLock } from "./lock.ts";
import {
  persistCatalogIpo,
  persistCurrentGmp,
  persistCurrentSubscription,
  persistFinancials,
  persistHistory,
  persistMappedGmpHistory,
  persistMappedIpoDetail,
  persistMappedSubscription,
  SyncRejectedError,
} from "./persist.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import { gmpCollectionIntervalMs, gmpCollectionReading } from "./gmp-interval.ts";
import { IpoGuruRequestError } from "../providers/ipo-guru/client.ts";
import { mapCurrentGmpCollection, type GmpMatchTarget } from "../providers/ipo-guru/gmp.ts";
import { mapGmpHistory } from "../providers/ipo-guru/history.ts";
import { mapAnchors } from "../providers/ipo-guru/anchors.ts";
import { mapIpoDetail } from "../providers/ipo-guru/detail.ts";
import { mapCurrentSubscription, mapSubscriptionHistory } from "../providers/ipo-guru/subscription.ts";
import {
  intervalFor,
  lastFinishedRecord,
  lastFinishedSync,
  lastSuccessfulSync,
  planGmpHistory,
  planIpoDetail,
  planIssueSync,
  planSubscriptionSync,
  syncDue,
  syncPhase,
  syncResource,
  type PlanIpoRef,
  type SubscriptionFetch,
} from "./schedule.ts";

function toPlanIpoRef(ipo: IpoRecord): PlanIpoRef {
  return {
    id: ipo.id,
    status: ipo.status,
    listingDate: ipo.dates.listingDate,
    listingPriceRupees: ipo.listing?.listingPriceRupees ?? null,
    hasCompanyNarrative: Boolean(ipo.profile?.about || ipo.profile?.description),
  };
}

export class ManualSyncError extends Error {
  constructor() {
    super("Manual synchronization is available only in development.");
    this.name = "ManualSyncError";
  }
}

const manualSyncToken = /^[A-Za-z0-9._~-]{16,128}$/;

/** Production never runs a one-shot sync. Development still needs a token that is not logged. */
export function assertManualSyncAllowed(nodeEnv: "development" | "test" | "production", token: string | undefined): void {
  if (nodeEnv === "production" || !manualSyncToken.test(token ?? "")) throw new ManualSyncError();
}

export type SyncJobStatus = "succeeded" | "failed" | "skipped";

export type SyncJobResult = {
  resource: string;
  status: SyncJobStatus;
  fetchedCount: number;
  errorName: string | null;
  durationMs: number;
};

/** Optional gates for a one-shot cron pass. Undefined keys default to allowed. */
export type SyncTaskFilter = {
  catalog?: boolean;
  gmpCollection?: boolean;
  subscriptionCurrent?: boolean;
  gmpHistory?: boolean;
  subscriptionHistory?: boolean;
  ipoDetail?: boolean;
  issueEnrichment?: boolean;
};

export type SyncContext = {
  providerKey: ProviderKey;
  gateway: ProviderGateway;
  quota: QuotaGate;
  store: PersistenceStore;
  cache: CacheService;
  locks: SyncLock;
  policy: SyncPolicy;
  now: () => Date;
  logger: Logger;
  stopped?: () => boolean;
  /** When set, skips specialized IPO Guru loaders outside the current cron window. */
  taskFilter?: SyncTaskFilter;
  /** IPO Guru catalogue refresh. Mock per-issue subscription and financial reads stay uncalled. */
  ipoGuruCatalog?: boolean;
  /** One `GET /gmp` collection. Absent unless the IPO Guru client is enabled. */
  loadCurrentGmp?: () => Promise<readonly unknown[]>;
  /** One `GET /ipos/{slug}/gmp/history` for a due issue. Absent unless the IPO Guru client is enabled. */
  loadGmpHistory?: (slug: string) => Promise<unknown>;
  /** One `GET /ipos/{slug}/subscription` for a due issue. */
  loadCurrentSubscription?: (slug: string) => Promise<unknown>;
  /** One `GET /ipos/{slug}/subscription/history` for a due issue. */
  loadSubscriptionHistory?: (slug: string) => Promise<unknown>;
  /** One `GET /ipos/{slug}` for a due issue. Absent unless the IPO Guru client is enabled. */
  loadIpoDetail?: (slug: string) => Promise<unknown>;
  /**
   * One `GET /ipos/{slug}/anchors` for an open or upcoming issue that is already due for a detail refresh.
   * Listed and closed issues are not polled, so this does not backfill historical anchor books.
   */
  loadAnchors?: (slug: string) => Promise<unknown>;
  gmpBudget?: { requestsPerDay: number; reservedRequests: number };
};

function taskAllowed(context: SyncContext, key: keyof SyncTaskFilter): boolean {
  return context.taskFilter?.[key] !== false;
}

type RunState = {
  calls: number;
  stopForQuota: boolean;
};

export async function runManualSync(
  nodeEnv: "development" | "test" | "production",
  context: SyncContext,
  categories?: readonly SyncCategory[],
): Promise<SyncJobResult[]> {
  if (nodeEnv === "production") throw new ManualSyncError();
  return runSyncTick(context, categories);
}

/**
 * One scheduler pass. It does not start a timer.
 * IPO Guru refreshes the catalogue list, one current-GMP poll, subscription, GMP history, subscription history, then one issue document for due issues.
 * Each per-issue read is one request. List pages do not call IPO Guru. Subscription history is separate from GMP history.
 */
export async function runSyncTick(context: SyncContext, categories?: readonly SyncCategory[]): Promise<SyncJobResult[]> {
  if (context.providerKey === "ipo-guru" && !context.ipoGuruCatalog) {
    context.logger.info("Sync skipped because IPO Guru catalogue synchronization is not enabled");
    return [];
  }
  const selected = context.ipoGuruCatalog
    ? (["catalog"] as const)
    : (categories ?? (["catalog", "gmp", "subscription", "financial", "history"] as const));
  const state: RunState = { calls: 0, stopForQuota: false };
  const results: SyncJobResult[] = [];
  if (selected.includes("catalog") && taskAllowed(context, "catalog")) {
    results.push(...(await runCatalog(context, state)));
  }
  if (!state.stopForQuota && !context.stopped?.() && context.loadCurrentGmp && taskAllowed(context, "gmpCollection")) {
    results.push(...(await runGmpCollection(context, state)));
  }
  if (
    !state.stopForQuota &&
    !context.stopped?.() &&
    context.loadCurrentSubscription &&
    taskAllowed(context, "subscriptionCurrent")
  ) {
    results.push(...(await runSubscription(context, state, "current")));
  }
  if (!state.stopForQuota && !context.stopped?.() && context.loadGmpHistory && taskAllowed(context, "gmpHistory")) {
    results.push(...(await runGmpHistory(context, state)));
  }
  if (
    !state.stopForQuota &&
    !context.stopped?.() &&
    context.loadSubscriptionHistory &&
    taskAllowed(context, "subscriptionHistory")
  ) {
    results.push(...(await runSubscription(context, state, "history")));
  }
  if (!state.stopForQuota && !context.stopped?.() && context.loadIpoDetail && taskAllowed(context, "ipoDetail")) {
    results.push(...(await runIpoDetail(context, state)));
  }
  if (state.stopForQuota || context.stopped?.() || !taskAllowed(context, "issueEnrichment")) return results;
  const ipos = await context.store.ipos.list();
  const runs = await context.store.sync.findByProvider(context.providerKey, context.now());
  const plan = planIssueSync({
    now: context.now(),
    policy: context.policy,
    ipos,
    lastSuccessAt: (category, subject) => lastFinishedSync(runs, syncResource(category, subject)),
    categories: selected,
  });
  for (const item of plan) {
    if (context.stopped?.() || state.stopForQuota) break;
    if (state.calls + item.calls > context.policy.maxCallsPerTick) continue;
    results.push(await runIssue(context, state, item.category, item.subject));
  }
  return results;
}

async function runCatalog(context: SyncContext, state: RunState): Promise<SyncJobResult[]> {
  const runs = await context.store.sync.findByProvider(context.providerKey, context.now());
  if (!syncDue(lastFinishedSync(runs, syncResource("catalog", "catalogue")), context.policy.catalogMs, context.now())) {
    return [];
  }
  if (state.calls + 1 > context.policy.maxCallsPerTick) return [];
  const release = await context.locks.acquire(syncResource("catalog", "catalogue"), context.policy.lockMs);
  if (!release) return [skipped(syncResource("catalog", "catalogue"))];
  const startedAt = context.now();
  try {
    await writeRun(context, "catalog", "catalogue", startedAt, "running", 0, null);
    const listed = await metered(context, state, "catalog", "catalogue", startedAt, () => context.gateway.listIpos({}));
    if (listed.records) {
      return persistListedRecords(context, listed.records, startedAt);
    }
    const ranked = listed.value.slice().sort((left, right) => {
      const phaseOrder = { open: 0, upcoming: 1, other: 2, listed: 3 } as const;
      return phaseOrder[syncPhase(left.status)] - phaseOrder[syncPhase(right.status)] || left.slug.localeCompare(right.slug);
    });
    let fetchedCount = 0;
    let failed = false;
    let deferred = false;
    for (const summary of ranked) {
      if (context.stopped?.() || state.stopForQuota) {
        deferred = true;
        break;
      }
      if (state.calls + 1 > context.policy.maxCallsPerTick) {
        deferred = true;
        break;
      }
      const detailStarted = context.now();
      const detailRelease = await context.locks.acquire(syncResource("catalog", summary.id), context.policy.lockMs);
      if (!detailRelease) {
        deferred = true;
        continue;
      }
      try {
        const detail = await metered(context, state, "catalog", summary.id, detailStarted, () => context.gateway.getIpoDetails(summary.id));
        const writes = await persistCatalogIpo(context.store, detail.value, context.providerKey, context.now(), {
          externalId: context.providerKey === "ipo-guru" ? detail.value.slug : detail.value.id,
        });
        await invalidate(context, [
          ["listings", "catalogue"],
          ["listings", "catalogue-facts"],
          ["issue", detail.value.slug],
          ["registrars", detail.value.slug],
        ]);
        await writeRun(context, "catalog", summary.id, detailStarted, "succeeded", writes, null);
        fetchedCount += writes;
      } catch (error) {
        await writeRun(context, "catalog", summary.id, detailStarted, "failed", 0, errorName(error));
        if (error instanceof QuotaExhaustedError) state.stopForQuota = true;
        failed = true;
      } finally {
        await detailRelease();
      }
    }
    if (failed) {
      await writeRun(context, "catalog", "catalogue", startedAt, "failed", fetchedCount, "SyncRejectedError");
      return [finished(syncResource("catalog", "catalogue"), "failed", fetchedCount, "SyncRejectedError", startedAt, context.now())];
    }
    if (deferred) {
      return [finished(syncResource("catalog", "catalogue"), "skipped", fetchedCount, null, startedAt, context.now())];
    }
    await writeRun(context, "catalog", "catalogue", startedAt, "succeeded", fetchedCount, null);
    return [finished(syncResource("catalog", "catalogue"), "succeeded", fetchedCount, null, startedAt, context.now())];
  } catch (error) {
    await writeRun(context, "catalog", "catalogue", startedAt, "failed", 0, errorName(error));
    if (error instanceof QuotaExhaustedError) state.stopForQuota = true;
    return [finished(syncResource("catalog", "catalogue"), "failed", 0, errorName(error), startedAt, context.now())];
  } finally {
    await release();
  }
}

async function persistListedRecords(context: SyncContext, records: readonly Ipo[], startedAt: Date): Promise<SyncJobResult[]> {
  const ranked = records.slice().sort((left, right) => {
    const phaseOrder = { open: 0, upcoming: 1, other: 2, listed: 3 } as const;
    return phaseOrder[syncPhase(left.status)] - phaseOrder[syncPhase(right.status)] || left.slug.localeCompare(right.slug);
  });
  let fetchedCount = 0;
  for (const ipo of ranked) {
    if (context.stopped?.()) {
      return [finished(syncResource("catalog", "catalogue"), "skipped", fetchedCount, null, startedAt, context.now())];
    }
    const writes = await persistCatalogIpo(context.store, ipo, context.providerKey, context.now(), { externalId: ipo.slug });
    fetchedCount += writes;
    await invalidate(context, [
      ["listings", "catalogue"],
      ["listings", "catalogue-facts"],
      ["issue", ipo.slug],
      ["gmp", ipo.slug],
    ]);
  }
  await writeRun(context, "catalog", "catalogue", startedAt, "succeeded", fetchedCount, null);
  return [finished(syncResource("catalog", "catalogue"), "succeeded", fetchedCount, null, startedAt, context.now())];
}

async function runGmpCollection(context: SyncContext, state: RunState): Promise<SyncJobResult[]> {
  const load = context.loadCurrentGmp;
  if (!load) return [];
  const resource = syncResource("gmp", "collection");
  const runs = await context.store.sync.findByProvider(context.providerKey, context.now());
  const ipos = await context.store.ipos.list();
  const today = istCalendarDate(context.now()) ?? "";
  const live = ipos.filter((ipo) => {
    // Never revive a stored closed/allotment/listed row into the live GMP set.
    if (ipo.status === "closed" || ipo.status === "allotment" || ipo.status === "listed") return false;
    if (!today) return ipo.status === "open" || ipo.status === "upcoming";
    const resolved = resolveIpoLifecycle({
      today,
      openDate: ipo.dates.openDate,
      closeDate: ipo.dates.closeDate,
      allotmentDate: ipo.dates.allotmentDate,
      listingDate: ipo.dates.listingDate,
      providerStatus: ipo.status,
      listingConfirmed: false,
    });
    if (resolved.status === "unknown") return ipo.status === "open" || ipo.status === "upcoming";
    // Date-resolved close after the IST close date drops a stale stored Open without waiting for sync.
    return resolved.status === "open" || resolved.status === "upcoming";
  });
  const observedAt = [];
  for (const ipo of live) {
    const rows = await context.store.gmp.findByIpo(ipo.id, context.now());
    const latest = rows.reduce<(typeof rows)[number] | null>((chosen, row) => {
      if (!chosen || row.observedAt.getTime() >= chosen.observedAt.getTime()) return row;
      return chosen;
    }, null);
    observedAt.push(latest?.observedAt ?? null);
  }
  const budget = context.gmpBudget ?? { requestsPerDay: defaultQuotaPolicy().requestsPerDay, reservedRequests: defaultQuotaPolicy().reservedRequests };
  const used = await context.quota.snapshot();
  const interval = gmpCollectionIntervalMs({
    configuredMs: context.policy.gmpCollectionMs,
    reading: gmpCollectionReading({
      liveCount: live.length,
      observedAt,
      now: context.now(),
      freshMs: context.policy.gmpCollectionMs,
    }),
    dayUsed: used.dayUsed,
    requestsPerDay: budget.requestsPerDay,
    reservedRequests: budget.reservedRequests,
  });
  if (!syncDue(lastFinishedSync(runs, resource), interval, context.now())) return [];
  if (state.calls + 1 > context.policy.maxCallsPerTick) return [];
  const release = await context.locks.acquire(resource, context.policy.lockMs);
  if (!release) return [skipped(resource)];
  const startedAt = context.now();
  let counted = false;
  try {
    await writeRun(context, "gmp", "collection", startedAt, "running", 0, null);
    if (live.length === 0) {
      await writeRun(context, "gmp", "collection", startedAt, "succeeded", 0, null);
      return [finished(resource, "succeeded", 0, null, startedAt, context.now())];
    }
    await context.cache.invalidate("provider", "gmp", "collection");
    const loaded = await context.cache.getOrLoad({
      namespace: "provider",
      resource: "gmp",
      id: "collection",
      freshMs: interval,
      meter: "provider",
      load,
      parse: (value) => {
        if (!Array.isArray(value)) throw new Error("GMP collection is not a list.");
        return value;
      },
    });
    if (loaded.source === "origin") {
      counted = true;
      state.calls += 1;
      await recordUsage(context, "gmp", "collection", startedAt, 200, elapsedMs(context, startedAt));
    }
    const targets: GmpMatchTarget[] = live.map((ipo) => ({
      slug: ipo.slug,
      status: ipo.status,
      offer: {
        issuePriceRupees: ipo.issue.issuePriceRupees,
        priceBandLowRupees: ipo.issue.priceBandLowRupees,
        priceBandHighRupees: ipo.issue.priceBandHighRupees,
      },
    }));
    const readings = mapCurrentGmpCollection(loaded.value, targets, context.now());
    let fetchedCount = 0;
    for (const reading of readings) {
      const ipo = live.find((item) => item.slug === reading.slug);
      if (!ipo) continue;
      fetchedCount += await persistCurrentGmp(
        context.store,
        ipo.id,
        reading.snapshot,
        {
          sourceName: "IPO Guru Pro",
          retrievedAt: context.now().toISOString(),
          freshness: reading.snapshot.freshness,
        },
        context.now(),
      );
      await invalidate(context, [["gmp", ipo.slug]]);
    }
    await writeRun(context, "gmp", "collection", startedAt, "succeeded", fetchedCount, null);
    context.logger.info("GMP collection finished", { fetchedCount, upstream: loaded.source });
    return [finished(resource, "succeeded", fetchedCount, null, startedAt, context.now())];
  } catch (error) {
    if (error instanceof QuotaExhaustedError) state.stopForQuota = true;
    if (!counted) {
      state.calls += 1;
      await recordUsage(context, "gmp", "collection", startedAt, error instanceof QuotaExhaustedError ? 429 : 503, elapsedMs(context, startedAt));
    }
    const name = errorName(error);
    await writeRun(context, "gmp", "collection", startedAt, "failed", 0, name);
    context.logger.error("GMP collection failed", { name });
    return [finished(resource, "failed", 0, name, startedAt, context.now())];
  } finally {
    await release();
  }
}

async function runGmpHistory(context: SyncContext, state: RunState): Promise<SyncJobResult[]> {
  const load = context.loadGmpHistory;
  if (!load) return [];
  const ipos = await context.store.ipos.list();
  const runs = await context.store.sync.findByProvider(context.providerKey, context.now());
  const plan = planGmpHistory({
    now: context.now(),
    policy: context.policy,
    ipos,
    lastFinishedAt: (ipoId) => lastFinishedSync(runs, syncResource("history", ipoId)),
    lastSuccessAt: (ipoId) => lastSuccessfulSync(runs, syncResource("history", ipoId)),
  });
  const results: SyncJobResult[] = [];
  for (const item of plan) {
    if (context.stopped?.() || state.stopForQuota) break;
    if (state.calls + item.calls > context.policy.maxCallsPerTick) continue;
    results.push(await runOneGmpHistory(context, state, item.subject, load));
  }
  return results;
}

async function runOneGmpHistory(
  context: SyncContext,
  state: RunState,
  ipoId: string,
  load: (slug: string) => Promise<unknown>,
): Promise<SyncJobResult> {
  const resource = syncResource("history", ipoId);
  const release = await context.locks.acquire(resource, context.policy.lockMs);
  if (!release) return skipped(resource);
  const startedAt = context.now();
  try {
    const ipo = (await context.store.ipos.list()).find((item) => item.id === ipoId);
    if (!ipo) throw new SyncRejectedError();
    const freshRuns = await context.store.sync.findByProvider(context.providerKey, context.now());
    const settled = ipo.status === "closed" || ipo.status === "allotment" || ipo.status === "listed";
    const stillDue =
      !(settled && lastSuccessfulSync(freshRuns, resource)) &&
      syncDue(lastFinishedSync(freshRuns, resource), intervalFor(context.policy, "history", syncPhase(ipo.status)), context.now());
    if (!stillDue) return skipped(resource);
    await writeRun(context, "history", ipoId, startedAt, "running", 0, null);
    const payload = await metered(context, state, "history", ipoId, startedAt, () => load(ipo.slug));
    const series = mapGmpHistory(payload, {
      offer: {
        issuePriceRupees: ipo.issue.issuePriceRupees,
        priceBandLowRupees: ipo.issue.priceBandLowRupees,
        priceBandHighRupees: ipo.issue.priceBandHighRupees,
      },
    });
    if (!series) throw new SyncRejectedError();
    const fetchedCount = await persistMappedGmpHistory(context.store, ipo.id, series, context.now());
    await invalidate(context, [["history", `gmp-${ipo.slug}`]]);
    await writeRun(context, "history", ipoId, startedAt, "succeeded", fetchedCount, null);
    context.logger.info("GMP history finished", { slug: ipo.slug, fetchedCount, truncated: series.window.truncated });
    return finished(resource, "succeeded", fetchedCount, null, startedAt, context.now());
  } catch (error) {
    if (error instanceof QuotaExhaustedError) state.stopForQuota = true;
    const name = errorName(error);
    await writeRun(context, "history", ipoId, startedAt, "failed", 0, name);
    context.logger.error("GMP history failed", { resource, name });
    return finished(resource, "failed", 0, name, startedAt, context.now());
  } finally {
    await release();
  }
}

class PlanUpgradeError extends Error {
  constructor() {
    super("IPO Guru plan does not include this subscription read.");
    this.name = "PlanUpgradeError";
  }
}

function subscriptionResource(kind: SubscriptionFetch["kind"], ipoId: string): string {
  return kind === "current" ? syncResource("subscription", ipoId) : syncResource("history", `sub-${ipoId}`);
}

async function runSubscription(context: SyncContext, state: RunState, kind: SubscriptionFetch["kind"]): Promise<SyncJobResult[]> {
  const load = kind === "current" ? context.loadCurrentSubscription : context.loadSubscriptionHistory;
  if (!load) return [];
  const ipos = await context.store.ipos.list();
  const runs = await context.store.sync.findByProvider(context.providerKey, context.now());
  const plan = planSubscriptionSync({
    now: context.now(),
    policy: context.policy,
    kind,
    ipos: ipos.map(toPlanIpoRef),
    lastRun: (ipoId) => lastFinishedRecord(runs, subscriptionResource(kind, ipoId)),
  });
  const results: SyncJobResult[] = [];
  for (const item of plan) {
    if (context.stopped?.() || state.stopForQuota) break;
    if (state.calls + item.calls > context.policy.maxCallsPerTick) continue;
    results.push(await runOneSubscription(context, state, item.subject, kind, load));
  }
  return results;
}

async function runOneSubscription(
  context: SyncContext,
  state: RunState,
  ipoId: string,
  kind: SubscriptionFetch["kind"],
  load: (slug: string) => Promise<unknown>,
): Promise<SyncJobResult> {
  const resource = subscriptionResource(kind, ipoId);
  const release = await context.locks.acquire(resource, context.policy.lockMs);
  if (!release) return skipped(resource);
  const startedAt = context.now();
  const category = kind === "current" ? "subscription" : "history";
  try {
    const ipo = (await context.store.ipos.list()).find((item) => item.id === ipoId);
    if (!ipo) throw new SyncRejectedError();
    const freshRuns = await context.store.sync.findByProvider(context.providerKey, context.now());
    const stillDue = planSubscriptionSync({
      now: context.now(),
      policy: context.policy,
      kind,
      ipos: [toPlanIpoRef(ipo)],
      lastRun: () => lastFinishedRecord(freshRuns, resource),
    });
    if (stillDue.length === 0) return skipped(resource);
    await writeRun(context, category, kind === "current" ? ipoId : `sub-${ipoId}`, startedAt, "running", 0, null);
    const payload = await metered(context, state, category, kind === "current" ? ipoId : `sub-${ipoId}`, startedAt, () => load(ipo.slug));
    const series = kind === "current" ? mapCurrentSubscription(payload) : mapSubscriptionHistory(payload);
    if (!series) throw new SyncRejectedError();
    const fetchedCount = await persistMappedSubscription(context.store, ipo.id, series, kind === "current" ? "live" : "daily", context.now());
    await invalidate(context, [
      ["subscription", ipo.slug],
      ["history", `sub-${ipo.slug}`],
    ]);
    await writeRun(context, category, kind === "current" ? ipoId : `sub-${ipoId}`, startedAt, "succeeded", fetchedCount, null);
    context.logger.info("Subscription sync finished", { slug: ipo.slug, kind, fetchedCount });
    return finished(resource, "succeeded", fetchedCount, null, startedAt, context.now());
  } catch (error) {
    const failure = isPlanUpgrade(error) ? new PlanUpgradeError() : error;
    if (failure instanceof QuotaExhaustedError) state.stopForQuota = true;
    const name = errorName(failure);
    await writeRun(context, category, kind === "current" ? ipoId : `sub-${ipoId}`, startedAt, "failed", 0, name);
    context.logger.error("Subscription sync failed", { resource, name });
    return finished(resource, "failed", 0, name, startedAt, context.now());
  } finally {
    await release();
  }
}

async function runIpoDetail(context: SyncContext, state: RunState): Promise<SyncJobResult[]> {
  const load = context.loadIpoDetail;
  if (!load) return [];
  const ipos = await context.store.ipos.list();
  const runs = await context.store.sync.findByProvider(context.providerKey, context.now());
  const plan = planIpoDetail({
    now: context.now(),
    policy: context.policy,
    ipos: ipos.map(toPlanIpoRef),
    lastRun: (ipoId) => lastFinishedRecord(runs, syncResource("financial", ipoId)),
  });
  const results: SyncJobResult[] = [];
  for (const item of plan) {
    if (context.stopped?.() || state.stopForQuota) break;
    const anchorCall = context.loadAnchors && (item.phase === "open" || item.phase === "upcoming") ? 1 : 0;
    if (state.calls + item.calls + anchorCall > context.policy.maxCallsPerTick) continue;
    results.push(await runOneIpoDetail(context, state, item.subject, load));
  }
  return results;
}

async function runOneIpoDetail(
  context: SyncContext,
  state: RunState,
  ipoId: string,
  load: (slug: string) => Promise<unknown>,
): Promise<SyncJobResult> {
  const resource = syncResource("financial", ipoId);
  const release = await context.locks.acquire(resource, context.policy.lockMs);
  if (!release) return skipped(resource);
  const startedAt = context.now();
  try {
    const ipo = (await context.store.ipos.list()).find((item) => item.id === ipoId);
    if (!ipo) throw new SyncRejectedError();
    const freshRuns = await context.store.sync.findByProvider(context.providerKey, context.now());
    const stillDue = planIpoDetail({
      now: context.now(),
      policy: context.policy,
      ipos: [toPlanIpoRef(ipo)],
      lastRun: () => lastFinishedRecord(freshRuns, resource),
    });
    if (stillDue.length === 0) return skipped(resource);
    await writeRun(context, "financial", ipoId, startedAt, "running", 0, null);
    const payload = await metered(context, state, "financial", ipoId, startedAt, () => load(ipo.slug));
    const mapped = mapIpoDetail(payload, context.now(), {
      sourceName: "IPO Guru Pro",
      retrievedAt: context.now().toISOString(),
      freshness: "fresh",
    });
    if (!mapped) throw new SyncRejectedError();
    if (context.loadAnchors && (ipo.status === "open" || ipo.status === "upcoming")) {
      const anchorsPayload = await metered(context, state, "financial", `${ipoId}:anchors`, startedAt, () => context.loadAnchors?.(ipo.slug) ?? Promise.reject(new SyncRejectedError()));
      const anchors = mapAnchors(anchorsPayload);
      if (!anchors) throw new SyncRejectedError();
      if (anchors.investors.length > 0) mapped.profile = { ...mapped.profile, anchors };
    }
    const fetchedCount = await persistMappedIpoDetail(context.store, mapped, context.providerKey, context.now());
    await invalidate(context, [["issue", ipo.slug]]);
    await writeRun(context, "financial", ipoId, startedAt, "succeeded", fetchedCount, null);
    context.logger.info("IPO detail finished", { slug: ipo.slug, fetchedCount });
    return finished(resource, "succeeded", fetchedCount, null, startedAt, context.now());
  } catch (error) {
    if (error instanceof QuotaExhaustedError) state.stopForQuota = true;
    const name = errorName(error);
    await writeRun(context, "financial", ipoId, startedAt, "failed", 0, name);
    context.logger.error("IPO detail failed", { resource, name });
    return finished(resource, "failed", 0, name, startedAt, context.now());
  } finally {
    await release();
  }
}

function isPlanUpgrade(error: unknown): boolean {
  return error instanceof IpoGuruRequestError && (error.httpStatus === 402 || error.vendorCode === "plan_upgrade_required");
}

async function runIssue(context: SyncContext, state: RunState, category: Exclude<SyncCategory, "catalog">, ipoId: string): Promise<SyncJobResult> {
  const resource = syncResource(category, ipoId);
  const release = await context.locks.acquire(resource, context.policy.lockMs);
  if (!release) return skipped(resource);
  const startedAt = context.now();
  try {
    await writeRun(context, category, ipoId, startedAt, "running", 0, null);
    const ipo = (await context.store.ipos.list()).find((item) => item.id === ipoId);
    if (!ipo) throw new SyncLookupError();
    let fetchedCount = 0;
    if (category === "gmp") {
      const read = await metered(context, state, category, ipoId, startedAt, () => context.gateway.getCurrentGmp(ipoId));
      fetchedCount = await persistCurrentGmp(context.store, ipoId, read.value, read.provenance, context.now());
      await invalidate(context, [["gmp", ipo.slug]]);
    } else if (category === "subscription") {
      const read = await metered(context, state, category, ipoId, startedAt, () => context.gateway.getCurrentSubscription(ipoId));
      fetchedCount = await persistCurrentSubscription(context.store, ipoId, read.value, read.provenance, context.now());
      await invalidate(context, [["subscription", ipo.slug]]);
    } else if (category === "financial") {
      const read = await metered(context, state, category, ipoId, startedAt, () => context.gateway.getCompanyFinancials(ipoId));
      fetchedCount = await persistFinancials(context.store, ipo.companyId, read.value, read.provenance, context.now());
      await invalidate(context, [["history", `financials-${ipo.slug}`]]);
    } else {
      const gmp = await metered(context, state, category, ipoId, startedAt, () => context.gateway.getGmpHistory(ipoId));
      const subscription = await metered(context, state, category, `${ipoId}-subscription`, startedAt, () =>
        context.gateway.getSubscriptionHistory(ipoId),
      );
      fetchedCount = await persistHistory(context.store, ipoId, gmp.value, subscription.value, gmp.provenance, context.now());
      await invalidate(context, [
        ["history", `gmp-${ipo.slug}`],
        ["history", `sub-${ipo.slug}`],
      ]);
    }
    await writeRun(context, category, ipoId, startedAt, "succeeded", fetchedCount, null);
    const result = finished(resource, "succeeded", fetchedCount, null, startedAt, context.now());
    context.logger.info("Sync finished", { resource, status: result.status, durationMs: result.durationMs, fetchedCount });
    return result;
  } catch (error) {
    if (error instanceof QuotaExhaustedError) state.stopForQuota = true;
    const name = errorName(error);
    await writeRun(context, category, ipoId, startedAt, "failed", 0, name);
    context.logger.error("Sync failed", { resource, durationMs: Math.max(0, context.now().getTime() - startedAt.getTime()), name });
    return finished(resource, "failed", 0, name, startedAt, context.now());
  } finally {
    await release();
  }
}

async function metered<T>(
  context: SyncContext,
  state: RunState,
  category: SyncCategory,
  subject: string,
  startedAt: Date,
  load: () => Promise<T>,
): Promise<T> {
  if (state.calls >= context.policy.maxCallsPerTick) throw new QuotaExhaustedError("minute");
  state.calls += 1;
  try {
    const value = await context.quota.run(
      load,
      context.ipoGuruCatalog ? { retryable: () => false, outage: () => false } : undefined,
    );
    await recordUsage(context, category, subject, startedAt, 200, elapsedMs(context, startedAt));
    return value;
  } catch (error) {
    await recordUsage(context, category, subject, startedAt, error instanceof QuotaExhaustedError ? 429 : 503, elapsedMs(context, startedAt));
    throw error;
  }
}

async function invalidate(context: SyncContext, targets: readonly (readonly [CacheResource, string])[]): Promise<void> {
  for (const [resource, id] of targets) {
    try {
      await context.cache.invalidateAfterSync(resource, id);
    } catch (error) {
      if (error instanceof CachePolicyError) {
        // Persisted Mongo writes already succeeded; refuse to roll them back.
        // Log the policy reason so operators can distinguish key vs value vs TTL rejects.
        context.logger.error("Cache invalidation skipped", {
          resource,
          name: error.name,
          reason: error.reason,
          idLength: id.length,
        });
        continue;
      }
      context.logger.error("Cache invalidation failed", {
        resource,
        name: error instanceof Error ? error.name : "Error",
      });
    }
  }
}

async function writeRun(
  context: SyncContext,
  category: SyncCategory,
  subject: string,
  startedAt: Date,
  status: SyncRunRecord["status"],
  fetchedCount: number,
  failure: string | null,
): Promise<void> {
  await context.store.sync.upsert({
    providerKey: context.providerKey,
    resource: syncResource(category, subject),
    startedAt,
    finishedAt: status === "running" ? null : context.now(),
    status,
    fetchedCount,
    errorName: failure,
  });
}

function elapsedMs(context: SyncContext, startedAt: Date): number {
  return Math.min(120_000, Math.max(0, context.now().getTime() - startedAt.getTime()));
}

async function recordUsage(
  context: SyncContext,
  category: SyncCategory,
  subject: string,
  startedAt: Date,
  statusCode: number,
  durationMs: number,
): Promise<void> {
  const digest = createHash("sha256").update(`${category}:${subject}:${startedAt.toISOString()}`).digest("hex").slice(0, 16);
  try {
    await context.store.usage.upsert({
      providerKey: context.providerKey,
      endpoint: `/sync/${category}`,
      usageId: `sync-${digest}`,
      requestedAt: startedAt,
      statusCode,
      durationMs,
    });
  } catch (error) {
    context.logger.error("Sync usage was not recorded", { name: error instanceof Error ? error.name : "Error" });
  }
}

function errorName(error: unknown): string {
  const name = error instanceof Error && error.name ? error.name : "Error";
  return name.slice(0, 80);
}

function skipped(resource: string): SyncJobResult {
  return { resource, status: "skipped", fetchedCount: 0, errorName: null, durationMs: 0 };
}

function finished(resource: string, status: SyncJobStatus, fetchedCount: number, failure: string | null, startedAt: Date, finishedAt: Date): SyncJobResult {
  return {
    resource,
    status,
    fetchedCount,
    errorName: failure,
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
  };
}

class SyncLookupError extends Error {
  constructor() {
    super("The stored IPO is no longer available.");
    this.name = "SyncLookupError";
  }
}
