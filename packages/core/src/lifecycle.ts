import { isIsoDate } from "./dates.ts";

export type IpoLifecycleStatus = "upcoming" | "open" | "closed" | "allotment" | "listed";

export type CardStage = "open" | "last-day" | "allotment-awaited" | "allotment-out" | "upcoming" | "listed";

export type LifecycleResult =
  | { status: IpoLifecycleStatus }
  | { status: "unknown"; reason: "missing-dates" | "inconsistent-dates" | "invalid-date" };

export type LifecycleDates = {
  openDate?: string | null;
  closeDate?: string | null;
  allotmentDate?: string | null;
  listingDate?: string | null;
  today: string;
};

export type CloseBasis = "verified-clock" | "calendar-day" | "provider" | "unknown";

export type ResolvedLifecycle = {
  status: IpoLifecycleStatus;
  stage: CardStage;
  /** How the close transition was decided. Calendar-day is a documented fallback, not a verified clock. */
  closeBasis: CloseBasis;
};

/**
 * When no official IPO-specific closing instant is stored, bidding is treated as open
 * for the entire Asia/Kolkata calendar close date and closed from the next IST day.
 * This is not an assertion that bidding ends at a specific clock time such as 4:50 PM.
 */
export const closeTimeFallbackNote =
  "No official IPO-specific closing time is stored. Bidding is treated as open through the Asia/Kolkata close date and closed from the next calendar day. This is not a verified exchange clock.";

function ordered(earlier: string | null | undefined, later: string | null | undefined): boolean {
  if (!earlier || !later) return true;
  return earlier <= later;
}

/**
 * Date-only lifecycle. Prefer {@link resolveIpoLifecycle} when presentation must
 * override a stale provider Open after the close date.
 */
export function ipoLifecycleStatus(input: LifecycleDates): LifecycleResult {
  const resolved = resolveIpoLifecycle({
    today: input.today,
    openDate: input.openDate ?? null,
    closeDate: input.closeDate ?? null,
    allotmentDate: input.allotmentDate ?? null,
    listingDate: input.listingDate ?? null,
  });
  if (resolved.status === "unknown") return resolved;
  return { status: resolved.status };
}

/**
 * Shared IST lifecycle for API, website, and mobile.
 * Verified dates and confirmation flags override a stale provider Open/Closed label.
 * Allotment Out requires allotmentConfirmed. A passed allotment date alone is not enough.
 * Listed prefers an explicit listing confirmation; a passed listing date alone is used only
 * when no contradicting provider status remains open/closed without listing evidence.
 */
export function resolveIpoLifecycle(input: {
  today: string;
  openDate: string | null;
  closeDate: string | null;
  allotmentDate: string | null;
  listingDate: string | null;
  listingConfirmed?: boolean;
  allotmentConfirmed?: boolean;
  providerStatus?: IpoLifecycleStatus | null;
  /** Official IPO-specific close instant in absolute time. */
  closeAt?: Date | null;
  now?: Date;
}): ResolvedLifecycle | Extract<LifecycleResult, { status: "unknown" }> {
  const openDate = input.openDate;
  const closeDate = input.closeDate;
  const allotmentDate = input.allotmentDate;
  const listingDate = input.listingDate;
  const today = input.today;
  const dates = [today, openDate, closeDate, allotmentDate, listingDate];
  if (dates.some((date) => date !== null && !isIsoDate(date))) {
    return { status: "unknown", reason: "invalid-date" };
  }
  if (
    !ordered(openDate, closeDate) ||
    !ordered(closeDate, allotmentDate) ||
    !ordered(allotmentDate, listingDate) ||
    !ordered(closeDate, listingDate) ||
    !ordered(openDate, listingDate)
  ) {
    return { status: "unknown", reason: "inconsistent-dates" };
  }

  if (input.listingConfirmed === true || input.providerStatus === "listed") {
    return { status: "listed", stage: "listed", closeBasis: "provider" };
  }
  // Date-only resolution (no provider status) still treats a reached listing date as listed.
  // When a provider status is supplied, do not invent listing from the calendar alone — listings can slip.
  if (listingDate && today >= listingDate && input.providerStatus == null) {
    return { status: "listed", stage: "listed", closeBasis: "calendar-day" };
  }

  const biddingClosed = isBiddingClosed({
    today,
    closeDate,
    closeAt: input.closeAt ?? null,
    now: input.now ?? null,
  });

  if (biddingClosed.closed) {
    if (input.allotmentConfirmed === true) {
      return { status: "allotment", stage: "allotment-out", closeBasis: biddingClosed.basis };
    }
    if (allotmentDate && today >= allotmentDate) {
      return { status: "allotment", stage: "allotment-awaited", closeBasis: biddingClosed.basis };
    }
    return { status: "closed", stage: "allotment-awaited", closeBasis: biddingClosed.basis };
  }

  if (openDate && closeDate && today >= openDate && today <= closeDate) {
    const stage: CardStage = closeDate === today ? "last-day" : "open";
    return { status: "open", stage, closeBasis: biddingClosed.basis };
  }

  if (openDate && today < openDate) {
    return { status: "upcoming", stage: "upcoming", closeBasis: "unknown" };
  }

  if (input.providerStatus) {
    const stage = stageFromProvider(input.providerStatus, closeDate, today, input.allotmentConfirmed === true);
    return { status: input.providerStatus, stage, closeBasis: "provider" };
  }

  return { status: "unknown", reason: "missing-dates" };
}

function isBiddingClosed(input: {
  today: string;
  closeDate: string | null;
  closeAt: Date | null;
  now: Date | null;
}): { closed: boolean; basis: CloseBasis } {
  if (input.closeAt && input.now && !Number.isNaN(input.closeAt.getTime()) && !Number.isNaN(input.now.getTime())) {
    return { closed: input.now.getTime() > input.closeAt.getTime(), basis: "verified-clock" };
  }
  if (input.closeDate && input.today > input.closeDate) {
    return { closed: true, basis: "calendar-day" };
  }
  if (input.closeDate && input.today <= input.closeDate) {
    return { closed: false, basis: input.closeAt ? "verified-clock" : "calendar-day" };
  }
  return { closed: false, basis: "unknown" };
}

function stageFromProvider(
  status: IpoLifecycleStatus,
  closeDate: string | null,
  today: string,
  allotmentConfirmed: boolean,
): CardStage {
  if (status === "listed") return "listed";
  if (status === "upcoming") return "upcoming";
  if (status === "open") return closeDate !== null && closeDate === today ? "last-day" : "open";
  if (status === "closed" || status === "allotment") return allotmentConfirmed ? "allotment-out" : "allotment-awaited";
  return "open";
}
