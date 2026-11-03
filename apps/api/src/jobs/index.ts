import type { CacheResource } from "../config/cache-policy.ts";
import type { CacheService } from "../cache/service.ts";

/**
 * The API process does not run synchronization.
 * Start `apps/api/src/worker.ts` as its own process. Importing this module does not call IPO Guru.
 */
export const jobsStatus = "not_configured" as const;

/** Drops provider and public cache entries after a successful synchronization. */
export async function invalidateAfterSuccessfulSync(
  cache: CacheService,
  resource: CacheResource,
  id: string,
): Promise<void> {
  await cache.invalidateAfterSync(resource, id);
}

export { dueRefreshes, issueAmendmentChanged, refreshIssueAfterAmendment, requestManualRefresh, runScheduledRefreshes } from "./refresh-plan.ts";
export type { ListingRefreshState, ScheduledRefresh } from "./refresh-plan.ts";
