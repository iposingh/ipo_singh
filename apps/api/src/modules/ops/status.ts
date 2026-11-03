import { formatIstDateTime } from "@ipo-singh/core";
import type { CacheHandle } from "../../cache/connection.ts";
import type { AppConfig } from "../../config/env.ts";
import type { DatabaseHandle } from "../../db/handle.ts";
import type { ProviderUsageRecord, SyncRunRecord } from "../../db/records.ts";
import { alertMetricsSnapshot, pushMetricsSnapshot } from "../../notifications/metrics.ts";
import { validationFailureCount } from "../../ops/validation.ts";
import type { OperationsStatus } from "./schema.ts";
import { disabledIpoGuruMonitor, type IpoGuruClient } from "../../providers/ipo-guru/client.ts";

const endpointPattern = /^\/[A-Za-z0-9/._-]{0,199}$/;
const checkTimeoutMs = 2_000;

function observedAt(now: Date): { timestamp: string; timestampIst: string } {
  return { timestamp: now.toISOString(), timestampIst: formatIstDateTime(now) };
}

async function within<T>(check: () => Promise<T>, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const work = check().catch(() => fallback);
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), checkTimeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function summarizeUsage(rows: readonly ProviderUsageRecord[]): OperationsStatus["providerEndpoints"] {
  const grouped = new Map<string, { requests: number; samples: number; totalMs: number; maxMs: number }>();
  for (const row of rows) {
    if (!endpointPattern.test(row.endpoint)) continue;
    const current = grouped.get(row.endpoint) ?? { requests: 0, samples: 0, totalMs: 0, maxMs: 0 };
    current.requests += 1;
    if (row.durationMs !== null) {
      current.samples += 1;
      current.totalMs += row.durationMs;
      current.maxMs = Math.max(current.maxMs, row.durationMs);
    }
    grouped.set(row.endpoint, current);
  }
  return [...grouped.entries()]
    .sort((left, right) => right[1].requests - left[1].requests || left[0].localeCompare(right[0]))
    .slice(0, 20)
    .map(([endpoint, stats]) => ({
      endpoint,
      requests: stats.requests,
      latency: { samples: stats.samples, totalMs: stats.totalMs, maxMs: stats.maxMs },
    }));
}

function summarizeSync(rows: readonly SyncRunRecord[]): OperationsStatus["sync"] {
  let succeeded = 0;
  let failed = 0;
  let last: Date | null = null;
  for (const row of rows) {
    if (row.status === "succeeded") {
      succeeded += 1;
      if (row.finishedAt && (!last || row.finishedAt.getTime() > last.getTime())) last = row.finishedAt;
    } else if (row.status === "failed") {
      failed += 1;
    }
  }
  return { succeeded, failed, lastSuccessAt: last ? last.toISOString() : null };
}

export async function buildOperationsStatus(
  config: AppConfig,
  database: DatabaseHandle,
  cache: CacheHandle,
  now = new Date(),
  ipoGuru?: IpoGuruClient,
): Promise<OperationsStatus> {
  const [databaseCheck, cacheCheck, quota] = await Promise.all([
    within(() => database.check(), "unavailable" as const),
    within(() => cache.check(), "unavailable" as const),
    cache.quota.snapshot(),
  ]);
  const metrics = cache.service.metrics();
  const provider = config.provider?.primary ?? "not_configured";
  let providerEndpoints: OperationsStatus["providerEndpoints"] = [];
  let sync: OperationsStatus["sync"] = { succeeded: 0, failed: 0, lastSuccessAt: null };
  let storedMetrics: OperationsStatus["dependencies"]["storedMetrics"] = "not_configured";

  if (database.store && config.provider && databaseCheck === "ok") {
    const loaded = await within(async () => {
      const [usage, runs] = await Promise.all([
        database.store?.usage.findByProvider(config.provider?.primary ?? "", now) ?? [],
        database.store?.sync.findByProvider(config.provider?.primary ?? "", now) ?? [],
      ]);
      return { usage, runs };
    }, null);
    if (loaded) {
      providerEndpoints = summarizeUsage(loaded.usage);
      sync = summarizeSync(loaded.runs);
      storedMetrics = "ok";
    } else {
      storedMetrics = "unavailable";
    }
  }

  return {
    service: config.serviceName,
    version: config.version,
    ...observedAt(now),
    node: process.version,
    uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
    provider,
    providerRequests: providerEndpoints.reduce((total, item) => total + item.requests, 0),
    providerEndpoints,
    quota: {
      minuteUsed: quota.minuteUsed,
      minuteLimit: config.quota.requestsPerMinute,
      dayUsed: quota.dayUsed,
      dayLimit: config.quota.requestsPerDay,
      reservedRequests: config.quota.reservedRequests,
    },
    cache: {
      hits: metrics.hits,
      misses: metrics.misses,
      stale: metrics.staleHits,
    },
    sync,
    alerts: alertMetricsSnapshot(),
    push: pushMetricsSnapshot(),
    validationFailures: validationFailureCount(),
    ipoGuru: ipoGuru ? await ipoGuru.monitor() : disabledIpoGuruMonitor(),
    dependencies: {
      database: databaseCheck,
      cache: cacheCheck,
      storedMetrics,
    },
  };
}
