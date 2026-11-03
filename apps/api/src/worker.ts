import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectCache, createUnconfiguredCache } from "./cache/connection.ts";
import { loadLocalEnv } from "./config/load-env.ts";
import { readConfig } from "./config/env.ts";
import { readAlertPolicy } from "./config/alert-policy.ts";
import { readSyncPolicy } from "./config/sync-policy.ts";
import { readPackageVersion } from "./config/version.ts";
import { connectDatabase } from "./db/connection.ts";
import { runWorkerTick } from "./jobs/alert-pass.ts";
import { createSyncLock } from "./jobs/lock.ts";
import { createAlertCursor, runAlertEvaluation } from "./notifications/engine.ts";
import { runPushDelivery, runPushReceiptCheck } from "./notifications/push-delivery.ts";
import { assertManualSyncAllowed, ManualSyncError, runManualSync, runSyncTick, type SyncContext } from "./jobs/sync-service.ts";
import {
  createMongoAllotmentVerificationStore,
  runAllotmentVerificationPass,
} from "./jobs/allotment-verify.ts";
import { createAllotmentConfirmNotifier } from "./jobs/allotment/notify.ts";
import { createSyncWorker } from "./jobs/worker.ts";
import { createProviderGateway } from "./providers/gateway.ts";
import { createIpoGuruClient } from "./providers/ipo-guru/client.ts";
import { createRegisteredProviders } from "./providers/registry.ts";
import type { CacheHandle } from "./cache/connection.ts";
import type { CounterStore, CacheStore } from "./cache/store.ts";
import { createLogger } from "./shared/logger.ts";
import { registerProcessShutdown } from "./shared/shutdown.ts";

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!isDirectRun()) return;
  loadLocalEnv();
  const config = readConfig(process.env, readPackageVersion());
  const logger = createLogger({ level: config.logLevel, service: config.serviceName });

  const allotmentVerifyEnabled = process.env.ALLOTMENT_VERIFY_ENABLED === "true";
  const allotmentVerifyOnce = process.env.ALLOTMENT_VERIFY_MODE === "once";
  const allotmentRequested = allotmentVerifyEnabled || allotmentVerifyOnce;
  const syncOnce = process.env.SYNC_MODE === "once";

  if (syncOnce) {
    try {
      assertManualSyncAllowed(config.nodeEnv, process.env.SYNC_TOKEN);
    } catch (error) {
      if (error instanceof ManualSyncError) {
        logger.error("Manual sync is refused");
        process.exit(1);
      }
      throw error;
    }
  }

  const ipoGuruCatalog = config.provider?.primary === "ipo-guru" && config.ipoGuru.enabled;
  const providerReady = Boolean(config.provider && !(config.provider.primary === "ipo-guru" && !ipoGuruCatalog));

  if (!providerReady && !allotmentRequested) {
    logger.info("Sync worker is idle. IPO Guru is not called.");
    return;
  }

  if (!config.mongodb) {
    logger.error("Sync worker needs a database");
    process.exit(1);
  }

  const database = await connectDatabase(config, logger);
  const cache = config.redis
    ? await connectCache(config.redis, config.cache, config.quota, logger)
    : createUnconfiguredCache(config.cache, config.quota, logger);

  // Distributed locks are required whenever more than one worker host may run.
  // Without Redis, acquire fails closed unless a single-process opt-in is set (never in production).
  const allowProcessLocal =
    cache.store === null &&
    config.deployment !== "production" &&
    config.deployment !== "staging" &&
    process.env.SYNC_ALLOW_PROCESS_LOCAL_LOCK === "true";
  if (cache.store === null && !allowProcessLocal) {
    logger.error(
      config.deployment === "production" || config.deployment === "staging"
        ? "Sync worker requires REDIS_URL in staging/production for distributed locks"
        : "Sync worker needs REDIS_URL, or SYNC_ALLOW_PROCESS_LOCAL_LOCK=true for a single local process",
    );
    await database.close();
    await cache.close();
    process.exit(1);
  }
  if (allowProcessLocal) {
    logger.info("Sync locks are process-local only. Do not run more than one worker.");
  }
  const locks = createSyncLock(cache.store, {
    allowProcessLocal,
    environment: config.cache.environment,
  });
  const signal = { stopped: false };

  const close = async () => {
    await database.close();
    await cache.close();
  };

  const allotmentStore = createMongoAllotmentVerificationStore();
  const allotmentNotifier = createAllotmentConfirmNotifier({ database });

  async function runAllotmentPass(): Promise<void> {
    if (!database.store) return;
    const summary = await runAllotmentVerificationPass({
      store: database.store,
      verifications: allotmentStore,
      locks,
      cache: cache.service,
      logger,
      now: () => new Date(),
      notifier: allotmentNotifier,
      stopped: () => signal.stopped,
    });
    logger.info("Allotment verification pass finished", summary);
  }

  if (syncOnce || allotmentVerifyOnce) {
    try {
      if (syncOnce) {
        if (!providerReady || !config.provider) {
          logger.error("Manual sync needs a configured provider");
          process.exit(1);
        }
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
        const context: SyncContext = {
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
        await runManualSync(config.nodeEnv, context);
      }
      if (allotmentVerifyOnce || (syncOnce && allotmentVerifyEnabled)) {
        await runAllotmentPass();
      }
    } finally {
      await close();
    }
    return;
  }

  if (!providerReady || !config.provider) {
    if (allotmentVerifyEnabled) {
      logger.info("Allotment-only worker started", { allotmentVerifyEnabled: true });
      const worker = createSyncWorker({
        tickMs: readSyncPolicy(process.env).tickMs,
        logger,
        run: async () => {
          if (signal.stopped) return;
          try {
            await runAllotmentPass();
          } catch (error: unknown) {
            logger.error("Allotment verification failed", { name: error instanceof Error ? error.name : "Error" });
          }
        },
      });
      worker.start();
      registerProcessShutdown(
        process,
        async () => {
          signal.stopped = true;
          await worker.stop();
          await close();
          return true;
        },
        logger,
        (code) => {
          process.exit(code);
        },
      );
      return;
    }
    await close();
    logger.info("Sync worker is idle. IPO Guru is not called.");
    return;
  }

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
  const context: SyncContext = {
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

  const alertPolicy = readAlertPolicy(process.env);
  const worker = createSyncWorker({
    tickMs: context.policy.tickMs,
    logger,
    run: () =>
      runWorkerTick({
        sync: () => runSyncTick(context),
        alerts: async () => {
          if (allotmentVerifyEnabled) {
            try {
              await runAllotmentPass();
            } catch (error: unknown) {
              logger.error("Allotment verification failed", { name: error instanceof Error ? error.name : "Error" });
            }
          }
          await runAlertEvaluation({
            database,
            cache,
            locks: context.locks,
            cursor: createAlertCursor(cache.store),
            policy: alertPolicy,
            logger,
          });
          try {
            await runPushDelivery({
              database,
              locks: context.locks,
              policy: alertPolicy,
              logger,
              accessToken: process.env.EXPO_PUSH_ACCESS_TOKEN?.trim() || null,
            });
            await runPushReceiptCheck({
              database,
              locks: context.locks,
              policy: alertPolicy,
              logger,
              accessToken: process.env.EXPO_PUSH_ACCESS_TOKEN?.trim() || null,
            });
          } catch (error: unknown) {
            logger.error("Push delivery failed", { name: error instanceof Error ? error.name : "Error" });
          }
        },
        logger,
      }),
  });
  worker.start();
  logger.info("Sync worker started", {
    tickMs: context.policy.tickMs,
    provider: context.providerKey,
    allotmentVerifyEnabled,
    pushDeliveryEnabled: alertPolicy.pushDeliveryEnabled,
  });
  registerProcessShutdown(
    process,
    async () => {
      signal.stopped = true;
      await worker.stop();
      await close();
      return true;
    },
    logger,
    (code) => {
      process.exit(code);
    },
  );
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

await main();
