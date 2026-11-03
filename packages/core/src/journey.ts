import type { CardStage, IpoLifecycleStatus } from "./lifecycle.ts";
import { resolveIpoLifecycle } from "./lifecycle.ts";

export type { CardStage } from "./lifecycle.ts";

export type JourneyState = "complete" | "current" | "upcoming" | "unavailable";

export type JourneyMilestone = {
  id: "open" | "close" | "allotment" | "listing";
  label: string;
  date: string | null;
  state: JourneyState;
  /** Explains a scheduled date that has not been confirmed by status. */
  note: string | null;
};

const rank: Record<IpoLifecycleStatus, number> = {
  upcoming: 0,
  open: 1,
  closed: 2,
  allotment: 3,
  listed: 4,
};

/**
 * Four lifecycle milestones.
 * A date that has passed does not complete a milestone. Completion follows the stored status.
 * Allotment is complete when the issue is listed, or when a caller passes an explicit confirmation.
 */
export function ipoJourney(input: {
  status: IpoLifecycleStatus | null;
  openDate: string | null;
  closeDate: string | null;
  allotmentDate: string | null;
  listingDate: string | null;
  allotmentConfirmed?: boolean;
}): JourneyMilestone[] {
  const step = input.status ? rank[input.status] : -1;
  const allotmentDone = input.allotmentConfirmed === true || step >= rank.listed;
  return [
    milestone("open", "IPO opens", input.openDate, datedState(input.openDate, step >= rank.open, step === rank.upcoming)),
    milestone("close", "IPO closes", input.closeDate, datedState(input.closeDate, step >= rank.closed, step === rank.open)),
    milestone(
      "allotment",
      "Allotment",
      input.allotmentDate,
      datedState(input.allotmentDate, allotmentDone, step === rank.closed || step === rank.allotment),
      allotmentDone || !input.allotmentDate ? null : "Expected",
    ),
    milestone("listing", "Listing", input.listingDate, datedState(input.listingDate, step >= rank.listed, false)),
  ];
}

function datedState(date: string | null, complete: boolean, current: boolean): JourneyState {
  if (!date && !complete && !current) return "unavailable";
  if (complete) return "complete";
  if (current) return "current";
  if (!date) return "unavailable";
  return "upcoming";
}

function milestone(
  id: JourneyMilestone["id"],
  label: string,
  date: string | null,
  state: JourneyState,
  note: string | null = null,
): JourneyMilestone {
  return { id, label, date, state, note: state === "complete" ? null : note };
}

/**
 * Card stage for a mixed open section.
 * Prefer resolveIpoLifecycle when dates may contradict a stale provider status.
 */
export function ipoCardStage(input: {
  status: IpoLifecycleStatus | null;
  closeDate: string | null;
  today: string;
  allotmentConfirmed?: boolean;
  openDate?: string | null;
  allotmentDate?: string | null;
  listingDate?: string | null;
  listingConfirmed?: boolean;
}): CardStage | null {
  if (input.openDate !== undefined || input.allotmentDate !== undefined || input.listingDate !== undefined) {
    const resolved = resolveIpoLifecycle({
      today: input.today,
      openDate: input.openDate ?? null,
      closeDate: input.closeDate,
      allotmentDate: input.allotmentDate ?? null,
      listingDate: input.listingDate ?? null,
      allotmentConfirmed: input.allotmentConfirmed,
      listingConfirmed: input.listingConfirmed,
      providerStatus: input.status,
    });
    if (resolved.status === "unknown") return null;
    return resolved.stage;
  }
  if (input.status === "listed") return "listed";
  if (input.status === "upcoming") return "upcoming";
  if (input.status === "open") {
    return input.closeDate !== null && input.closeDate === input.today ? "last-day" : "open";
  }
  if (input.status === "closed" || input.status === "allotment") {
    return input.allotmentConfirmed === true ? "allotment-out" : "allotment-awaited";
  }
  return null;
}

export function isLastBiddingDay(input: {
  status: IpoLifecycleStatus | null;
  closeDate: string | null;
  today: string;
  openDate?: string | null;
}): boolean {
  return ipoCardStage(input) === "last-day";
}
