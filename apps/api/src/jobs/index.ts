import type { CacheResource } from "../config/cache-policy.ts";
import type { CacheService } from "../cache/service.ts";

/**
 * The API process does not run synchronization.
 * Production uses the Render Cron one-shot (`apps/api/src/cron.ts` / `npm run start:cron`).
 * Local development may still run `apps/api/src/worker.ts`. Importing this module does not call IPO Guru.
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
