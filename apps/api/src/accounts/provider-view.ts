import { adminProviderStatusSchema, type AdminProviderStatus } from "@ipo-singh/contracts";
import type { AppConfig } from "../config/env.ts";
import { effectiveIpoGuruRequestLimits } from "../config/ipoguru.ts";
import type { IpoGuruClient } from "../providers/ipo-guru/client.ts";

/** A status view. The API key, database URI, Redis password, and operations token stay on the server. */
export function redactedProviderStatus(
  config: AppConfig,
  account: AdminProviderStatus["account"] = null,
): AdminProviderStatus {
  const key = config.ipoGuru.apiKey;
  const limits = effectiveIpoGuruRequestLimits({
    enabled: config.ipoGuru.enabled,
    minuteBudget: config.ipoGuru.minuteBudget,
    dailyBudget: config.ipoGuru.dailyBudget,
    requestsPerMinute: config.quota.requestsPerMinute,
    requestsPerDay: config.quota.requestsPerDay,
    reservedRequests: config.quota.reservedRequests,
  });
  return adminProviderStatusSchema.parse({
    provider: config.provider?.primary ?? "not_configured",
    ipoGuruEnabled: config.ipoGuru.enabled,
    credentialConfigured: config.ipoGuru.enabled && typeof key === "string" && key.length > 0,
    minuteBudget: config.ipoGuru.enabled ? limits.requestsPerMinute : null,
    dailyBudget: config.ipoGuru.enabled ? limits.requestsPerDay : null,
    account,
  });
}

/** One optional GET /me for super-admin provider status. Failures leave account null. */
export async function loadProviderAccountSnapshot(
  client: IpoGuruClient | undefined,
  enabled: boolean,
): Promise<AdminProviderStatus["account"]> {
  if (!client || !enabled) return null;
  try {
    let monitor = await client.monitor();
    if (!monitor.account) {
      await client.readAccount();
      monitor = await client.monitor();
    }
    const snapshot = monitor.account;
    if (!snapshot) return null;
    return {
      plan: snapshot.plan,
      scopes: [...snapshot.scopes],
      limits: {
        perMinute: snapshot.limits.perMinute,
        perDay: snapshot.limits.perDay,
        gmpHistoryDays: snapshot.limits.gmpHistoryDays,
      },
      expiresAt: snapshot.expiresAt,
      observedAt: snapshot.observedAt,
    };
  } catch {
    return null;
  }
}
