import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectCache, createUnconfiguredCache, type CacheHandle } from "./cache/connection.ts";
import type { CounterStore, CacheStore } from "./cache/store.ts";
import { loadLocalEnv } from "./config/load-env.ts";
import { readConfig } from "./config/env.ts";
import { readAlertPolicy } from "./config/alert-policy.ts";
import { readCronPolicy } from "./config/cron-policy.ts";
import { readSyncPolicy } from "./config/sync-policy.ts";
import { readPackageVersion } from "./config/version.ts";
import { connectDatabase } from "./db/connection.ts";
import { createSyncLock } from "./jobs/lock.ts";
import { runCronPass } from "./jobs/cron-pass.ts";
import { createMongoAllotmentVerificationStore } from "./jobs/allotment-verify.ts";
import { createAllotmentConfirmNotifier } from "./jobs/allotment/notify.ts";
import type { SyncContext } from "./jobs/sync-service.ts";
import { createProviderGateway } from "./providers/gateway.ts";
import { createIpoGuruClient } from "./providers/ipo-guru/client.ts";
import { createRegisteredProviders } from "./providers/registry.ts";
import { createLogger } from "./shared/logger.ts";

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

function countersFrom(cache: CacheHandle): CounterStore | undefined {
  const store = cache.store;
  if (!store || !("increment" in store) || !("read" in store)) return undefined;
  const candidate = store as CacheStore & CounterStore;
  if (typeof candidate.increment !== "function" || typeof candidate.read !== "function") return undefined;
  return {
    increment: (key, ttlMs) => candidate.increment(key, ttlMs),
    read: (key) => candidate.read(key),
  };
}

/**
 * Production-safe one-shot Cron entry.
 * Render invokes this every five minutes (UTC cron). Task eligibility uses Asia/Kolkata windows.
 * This path does not use SYNC_MODE / SYNC_TOKEN manual-sync rules and never starts a timer loop.
 */
async function main(): Promise<void> {
  if (!isDirectRun()) return;
  loadLocalEnv();
  const config = readConfig(process.env, readPackageVersion());
  const logger = createLogger({ level: config.logLevel, service: `${config.serviceName}-cron` });
  const cronPolicy = readCronPolicy(process.env);
  const alertPolicy = readAlertPolicy(process.env);
  const allotmentVerifyEnabled = process.env.ALLOTMENT_VERIFY_ENABLED === "true";

  const ipoGuruCatalog = config.provider?.primary === "ipo-guru" && config.ipoGuru.enabled;
  const providerReady = Boolean(config.provider && !(config.provider.primary === "ipo-guru" && !ipoGuruCatalog));

  if (!providerReady && !allotmentVerifyEnabled) {
    logger.info("Cron pass idle. IPO Guru is not enabled and allotment verification is off.");
    process.exit(0);
  }

  if (!config.mongodb) {
    logger.error("Cron pass needs a database");
    process.exit(1);
  }

  const database = await connectDatabase(config, logger);
  const cache = config.redis
    ? await connectCache(config.redis, config.cache, config.quota, logger)
    : createUnconfiguredCache(config.cache, config.quota, logger);

  const allowProcessLocal =
    cache.store === null &&
    config.deployment !== "production" &&
    config.deployment !== "staging" &&
    process.env.SYNC_ALLOW_PROCESS_LOCAL_LOCK === "true";

  if (cache.store === null && !allowProcessLocal) {
    logger.error(
      config.deployment === "production" || config.deployment === "staging"
        ? "Cron pass requires REDIS_URL in staging/production for distributed locks"
        : "Cron pass needs REDIS_URL, or SYNC_ALLOW_PROCESS_LOCAL_LOCK=true for a single local process",
    );
    await database.close();
    await cache.close();
    process.exit(1);
  }
  if (allowProcessLocal) {
    logger.info("Cron locks are process-local only. Do not overlap invocations.");
  }

  const locks = createSyncLock(cache.store, {
    allowProcessLocal,
    environment: config.cache.environment,
  });
  const signal = { stopped: false };
  const allotmentStore = createMongoAllotmentVerificationStore();
  const allotmentNotifier = createAllotmentConfirmNotifier({ database });

  let syncContext: SyncContext | null = null;
  if (providerReady && config.provider) {
    const ipoGuru = ipoGuruCatalog
      ? createIpoGuruClient({
          settings: config.ipoGuru,
          quotaPolicy: config.quota,
          logger,
          counters: countersFrom(cache),
        })
      : undefined;
    const registered = createRegisteredProviders(config.provider, ipoGuru ? { ipoGuru: { client: ipoGuru } } : {});
    const gateway = createProviderGateway({
      primary: registered.primary,
      fallback: registered.fallback,
      timeoutMs: config.provider.timeoutMs,
    });
    syncContext = {
      providerKey: config.provider.primary,
      gateway,
      quota: cache.quota,
      store: database.store,
      cache: cache.service,
      locks,
      policy: readSyncPolicy(process.env),
      now: () => new Date(),
      logger,
      stopped: () => signal.stopped,
      ipoGuruCatalog,
      loadCurrentGmp: ipoGuru ? () => ipoGuru.listCurrentGmp() : undefined,
      loadGmpHistory: ipoGuru ? (slug) => ipoGuru.readGmpHistory(slug) : undefined,
      loadCurrentSubscription: ipoGuru ? (slug) => ipoGuru.readSubscription(slug) : undefined,
      loadSubscriptionHistory: ipoGuru ? (slug) => ipoGuru.readSubscriptionHistory(slug) : undefined,
      loadIpoDetail: ipoGuru ? (slug) => ipoGuru.readIssue(slug) : undefined,
      loadAnchors: ipoGuru ? (slug) => ipoGuru.readAnchors(slug) : undefined,
      gmpBudget: { requestsPerDay: config.quota.requestsPerDay, reservedRequests: config.quota.reservedRequests },
    };
  }

  let exitCode = 0;
  try {
    const summary = await runCronPass({
      now: () => new Date(),
      cronPolicy,
      syncContext,
      allotmentVerifyEnabled,
      database,
      cache,
      locks,
      alertPolicy,
      logger,
      allotmentStore,
      allotmentNotifier,
      expoAccessToken: process.env.EXPO_PUSH_ACCESS_TOKEN?.trim() || null,
      stopped: () => signal.stopped,
    });
    logger.info("Cron pass completed", {
      skippedOverlap: summary.skippedOverlap,
      failures: summary.failures,
      syncJobs: summary.syncResults.length,
      alertsRan: summary.alertsRan,
      pushRan: summary.pushRan,
      durationMs: Date.parse(summary.finishedAt) - Date.parse(summary.startedAt),
    });
    // Partial task failures exit nonzero so operators see them; overlap skips stay 0.
    if (summary.failures.length > 0 && !summary.skippedOverlap) exitCode = 1;
  } catch (error: unknown) {
    logger.error("Cron pass failed", { name: error instanceof Error ? error.name : "Error" });
    exitCode = 1;
  } finally {
    signal.stopped = true;
    await database.close();
    await cache.close();
  }
  process.exit(exitCode);
}

await main();
