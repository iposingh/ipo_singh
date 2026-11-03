import type { CachePolicy, CacheResource } from "../config/cache-policy.ts";
import type { CacheService } from "../cache/service.ts";
import { istCalendarDate } from "@ipo-singh/core";
import { istSlotInstant } from "./ist.ts";

export type ScheduledRefresh = {
  kind: "directory" | "listing";
  resource: "listings" | "listing";
  id: string;
  minuteOfDay: number;
};

export type ListingRefreshState = {
  id: string;
  listingDate: string | null;
  lastRefreshAt: Date | null;
};

/** The latest due slot wins, so a late start does not call the provider once per missed slot. */
export function dueRefreshes(input: {
  now: Date;
  policy: CachePolicy;
  directoryLastRefreshAt: Date | null;
  listings: readonly ListingRefreshState[];
}): ScheduledRefresh[] {
  const due: ScheduledRefresh[] = [];
  const today = istCalendarDate(input.now);
  const directorySlot = today ? istSlotInstant(today, input.policy.directoryRefreshMinute) : null;
  if (directorySlot && input.now.getTime() >= directorySlot.getTime()) {
    const last = input.directoryLastRefreshAt;
    if (!last || Number.isNaN(last.getTime()) || last.getTime() < directorySlot.getTime()) {
      due.push({ kind: "directory", resource: "listings", id: "directory", minuteOfDay: input.policy.directoryRefreshMinute });
    }
  }

  for (const issue of input.listings) {
    if (!issue.listingDate) continue;
    const ready = input.policy.listingRefreshMinutes.filter((minute) => {
      const slot = istSlotInstant(issue.listingDate ?? "", minute);
      if (!slot || input.now.getTime() < slot.getTime()) return false;
      const last = issue.lastRefreshAt;
      return !last || Number.isNaN(last.getTime()) || last.getTime() < slot.getTime();
    });
    const minuteOfDay = ready.at(-1);
    if (minuteOfDay === undefined) continue;
    due.push({ kind: "listing", resource: "listing", id: issue.id, minuteOfDay });
  }

  return due;
}

export function issueAmendmentChanged(previousRevision: string | null, nextRevision: string | null): boolean {
  if (!previousRevision || !nextRevision) return false;
  return previousRevision !== nextRevision;
}

/** Expires both cache copies so the next read refreshes, and keeps the last value if the provider is down. */
export async function requestManualRefresh(cache: CacheService, resource: CacheResource, id: string): Promise<void> {
  await cache.expireFreshness("provider", resource, id);
  await cache.expireFreshness("public", resource, id);
}

export async function refreshIssueAfterAmendment(
  cache: CacheService,
  id: string,
  previousRevision: string | null,
  nextRevision: string | null,
): Promise<boolean> {
  if (!issueAmendmentChanged(previousRevision, nextRevision)) return false;
  await requestManualRefresh(cache, "issue", id);
  return true;
}

/**
 * Runs due refreshes through the existing cache. A missing loader only marks entries stale.
 * This function does not start a timer and does not call a provider by itself.
 */
export async function runScheduledRefreshes<T>(input: {
  due: readonly ScheduledRefresh[];
  cache: CacheService;
  load?: (item: ScheduledRefresh) => Promise<T>;
  parse?: (value: unknown) => T;
}): Promise<readonly ScheduledRefresh[]> {
  const completed: ScheduledRefresh[] = [];
  for (const item of input.due) {
    await requestManualRefresh(input.cache, item.resource, item.id);
    if (input.load && input.parse) {
      const loaded = await input.cache.getOrLoad({
        namespace: "provider",
        resource: item.resource,
        id: item.id,
        load: () => input.load?.(item) ?? Promise.reject(new Error("Refresh loader is missing.")),
        parse: input.parse,
      });
      await loaded.refresh;
    }
    completed.push(item);
  }
  return completed;
}
