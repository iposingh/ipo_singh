import type { CronPolicy } from "../config/cron-policy.ts";
import { syncPolicyForCronPass } from "../config/cron-policy.ts";
import type { AlertPolicy } from "../config/alert-policy.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import type { CacheHandle } from "../cache/connection.ts";
import type { Logger } from "../shared/logger.ts";
import type { SyncLock } from "./lock.ts";
import {
  runSyncTick,
  type SyncContext,
  type SyncJobResult,
  type SyncTaskFilter,
} from "./sync-service.ts";
import { istMinuteOfDay, planCronTaskGates, type CronTaskGates } from "./cron-windows.ts";
import { runWorkerTick } from "./alert-pass.ts";
import { createAlertCursor, runAlertEvaluation } from "../notifications/engine.ts";
import { runPushDelivery, runPushReceiptCheck } from "../notifications/push-delivery.ts";
import { runAllotmentVerificationPass } from "./allotment-verify.ts";
import { defaultAllotmentVerifyPolicy, type AllotmentVerifyPolicy } from "./allotment/schedule.ts";
import type { createAllotmentConfirmNotifier } from "./allotment/notify.ts";

export const cronPassLockName = "cron-pass";

export type CronPassSummary = {
  startedAt: string;
  finishedAt: string;
  istMinute: number | null;
  gates: CronTaskGates;
  skippedOverlap: boolean;
  syncResults: SyncJobResult[];
  allotment: Record<string, unknown> | null;
  alertsRan: boolean;
  pushRan: boolean;
  failures: string[];
};

export type CronPassInput = {
  now: () => Date;
  cronPolicy: CronPolicy;
  syncContext: SyncContext | null;
  allotmentVerifyEnabled: boolean;
  database: DatabaseHandle;
  cache: CacheHandle;
  locks: SyncLock;
  alertPolicy: AlertPolicy;
  logger: Logger;
  allotmentStore: Parameters<typeof runAllotmentVerificationPass>[0]["verifications"];
  allotmentNotifier: ReturnType<typeof createAllotmentConfirmNotifier>;
  expoAccessToken: string | null;
  stopped?: () => boolean;
};

function filterFromGates(gates: CronTaskGates): SyncTaskFilter {
  return {
    catalog: gates.catalog,
    gmpCollection: gates.gmpCollection,
    subscriptionCurrent: gates.subscriptionCurrent,
    gmpHistory: gates.gmpHistory,
    subscriptionHistory: gates.subscriptionHistory,
    ipoDetail: gates.ipoDetail,
    // IPO Guru uses specialized loaders; mock enrichment stays off when catalog-only.
    issueEnrichment: false,
  };
}

/**
 * One Render Cron invocation.
 * Acquires a distributed pass lock, runs only IST-eligible tasks, then returns.
 * Never starts a timer loop.
 */
export async function runCronPass(input: CronPassInput): Promise<CronPassSummary> {
  const started = input.now();
  const failures: string[] = [];
  const gates = planCronTaskGates({
    now: started,
    policy: input.cronPolicy,
    allotmentVerifyEnabled: input.allotmentVerifyEnabled,
    providerReady: Boolean(input.syncContext),
  });

  const release = await input.locks.acquire(cronPassLockName, input.cronPolicy.passLockMs);
  if (!release) {
    input.logger.info("Cron pass skipped because another invocation holds the lock");
    return {
      startedAt: started.toISOString(),
      finishedAt: input.now().toISOString(),
      istMinute: null,
      gates,
      skippedOverlap: true,
      syncResults: [],
      allotment: null,
      alertsRan: false,
      pushRan: false,
      failures: [],
    };
  }

  let syncResults: SyncJobResult[] = [];
  let allotment: Record<string, unknown> | null = null;
  let alertsRan = false;
  let pushRan = false;

  try {
    const istMinute = istMinuteOfDay(started);
    input.logger.info("Cron pass started", {
      istMinute,
      gates,
      allotmentVerifyEnabled: input.allotmentVerifyEnabled,
      pushDeliveryEnabled: input.alertPolicy.pushDeliveryEnabled,
    });

    await runWorkerTick({
      sync: async () => {
        if (!input.syncContext) {
          input.logger.info("Cron sync skipped because no provider is configured");
          return;
        }
        const anySync =
          gates.catalog ||
          gates.gmpCollection ||
          gates.subscriptionCurrent ||
          gates.gmpHistory ||
          gates.subscriptionHistory ||
          gates.ipoDetail;
        if (!anySync) {
          input.logger.info("Cron sync skipped outside eligible IST windows");
          return;
        }
        const context: SyncContext = {
          ...input.syncContext,
          policy: syncPolicyForCronPass(input.syncContext.policy, input.cronPolicy),
          taskFilter: filterFromGates(gates),
          stopped: () => Boolean(input.stopped?.()),
        };
        syncResults = await runSyncTick(context);
        input.logger.info("Cron sync finished", {
          jobs: syncResults.length,
          succeeded: syncResults.filter((row) => row.status === "succeeded").length,
          failed: syncResults.filter((row) => row.status === "failed").length,
          skipped: syncResults.filter((row) => row.status === "skipped").length,
        });
      },
      alerts: async () => {
        if (gates.allotment) {
          try {
            const policy: AllotmentVerifyPolicy = {
              ...defaultAllotmentVerifyPolicy,
              pollIntervalMs: input.cronPolicy.allotmentIntervalMs,
            };
            if (!input.database.store) {
              input.logger.info("Allotment verification skipped because persistence is unavailable");
            } else {
              const summary = await runAllotmentVerificationPass({
                store: input.database.store,
                verifications: input.allotmentStore,
                locks: input.locks,
                cache: input.cache.service,
                logger: input.logger,
                now: input.now,
                notifier: input.allotmentNotifier,
                stopped: () => Boolean(input.stopped?.()),
                policy,
              });
              allotment = summary as unknown as Record<string, unknown>;
              input.logger.info("Cron allotment verification finished", summary);
            }
          } catch (error: unknown) {
            const name = error instanceof Error ? error.name : "Error";
            failures.push(`allotment:${name}`);
            input.logger.error("Cron allotment verification failed", { name });
          }
        } else if (input.allotmentVerifyEnabled) {
          input.logger.info("Cron allotment verification skipped outside overnight/morning IST windows");
        }

        if (!gates.alerts) return;
        try {
          await runAlertEvaluation({
            database: input.database,
            cache: input.cache,
            locks: input.locks,
            cursor: createAlertCursor(input.cache.store),
            policy: input.alertPolicy,
            logger: input.logger,
          });
          alertsRan = true;
        } catch (error: unknown) {
          const name = error instanceof Error ? error.name : "Error";
          failures.push(`alerts:${name}`);
          input.logger.error("Cron alert evaluation failed", { name });
        }

        try {
          await runPushDelivery({
            database: input.database,
            locks: input.locks,
            policy: input.alertPolicy,
            logger: input.logger,
            accessToken: input.expoAccessToken,
          });
          await runPushReceiptCheck({
            database: input.database,
            locks: input.locks,
            policy: input.alertPolicy,
            logger: input.logger,
            accessToken: input.expoAccessToken,
          });
          pushRan = true;
        } catch (error: unknown) {
          const name = error instanceof Error ? error.name : "Error";
          failures.push(`push:${name}`);
          input.logger.error("Cron push delivery failed", { name });
        }
      },
      logger: input.logger,
    });

    const finished = input.now();
    return {
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      istMinute: istMinuteOfDay(started),
      gates,
      skippedOverlap: false,
      syncResults,
      allotment,
      alertsRan,
      pushRan,
      failures,
    };
  } finally {
    await release();
  }
}
