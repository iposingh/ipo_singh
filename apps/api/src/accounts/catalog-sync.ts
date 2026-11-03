import type { AdminManualSyncResult } from "@ipo-singh/contracts";
import type { CacheHandle } from "../cache/connection.ts";
import type { AppConfig } from "../config/env.ts";
import { readSyncPolicy } from "../config/sync-policy.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import { createSyncLock } from "../jobs/lock.ts";
import { runSyncTick } from "../jobs/sync-service.ts";
import { createProviderGateway } from "../providers/gateway.ts";
import type { IpoGuruClient } from "../providers/ipo-guru/client.ts";
import { createRegisteredProviders } from "../providers/registry.ts";
import type { Logger } from "../shared/logger.ts";

export type ManualSyncDecision = "allowed" | "production" | "unconfigured" | "quota" | "unknown_quota";

/** One catalogue list at most. Production, a missing provider, and an exhausted or unknown quota are refused first. */
export function assessManualCatalogSync(input: {
  nodeEnv: AppConfig["nodeEnv"];
  provider: AppConfig["provider"];
  ipoGuruEnabled: boolean;
  minuteUsed: number | null;
  minuteLimit: number;
  dayUsed: number | null;
  dayLimit: number;
  reservedRequests: number;
}): ManualSyncDecision {
  if (input.nodeEnv === "production") return "production";
  if (!input.provider) return "unconfigured";
  if (input.provider.primary === "ipo-guru" && !input.ipoGuruEnabled) return "unconfigured";
  if (input.minuteUsed === null || input.dayUsed === null) return "unknown_quota";
  const dayFloor = Math.max(0, input.dayLimit - input.reservedRequests);
  if (input.minuteUsed >= input.minuteLimit || input.dayUsed >= dayFloor) return "quota";
  return "allowed";
}

/**
 * Runs the catalogue category with a one-call budget and no per-issue GMP, subscription, or history loaders.
 */
export async function runBoundedCatalogSync(input: {
  config: AppConfig;
  database: DatabaseHandle;
  cache: CacheHandle;
  logger: Logger;
  ipoGuru?: IpoGuruClient;
}): Promise<AdminManualSyncResult> {
  if (!input.database.store || !input.config.provider) return { status: "idle", fetchedCount: 0 };
  const selection = input.config.provider;
  const ipoGuruCatalog = selection.primary === "ipo-guru" && input.config.ipoGuru.enabled;
  if (selection.primary === "ipo-guru" && !ipoGuruCatalog) return { status: "idle", fetchedCount: 0 };
  const registered = createRegisteredProviders(selection, input.ipoGuru ? { ipoGuru: { client: input.ipoGuru } } : {});
  const gateway = createProviderGateway({
    primary: registered.primary,
    fallback: registered.fallback,
    timeoutMs: selection.timeoutMs,
  });
  const policy = { ...readSyncPolicy(process.env), maxCallsPerTick: 1 };
  const results = await runSyncTick(
    {
      providerKey: selection.primary,
      gateway,
      quota: input.cache.quota,
      store: input.database.store,
      cache: input.cache.service,
      locks: createSyncLock(input.cache.store, {
        // Manual admin sync without Redis stays single-API-process only outside production.
        allowProcessLocal: input.cache.store === null,
        environment: input.cache.policy.environment,
      }),
      policy,
      now: () => new Date(),
      logger: input.logger,
      ipoGuruCatalog,
    },
    ["catalog"],
  );
  const first = results[0];
  if (!first) return { status: "idle", fetchedCount: 0 };
  return { status: first.status, fetchedCount: first.fetchedCount };
}
