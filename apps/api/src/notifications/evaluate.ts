import type { AccountPreferences, IpoStatus } from "@ipo-singh/contracts";
import { formatInr, formatIstDate, istCalendarDate } from "@ipo-singh/core";

/** A rupee move at least this large, between two fresh readings, can be mentioned. */
export const significantGmpChangeRupees = 10;

export const subscriptionMilestones = [1, 2, 5, 10] as const;

export const notificationRetentionMs = 30 * 24 * 60 * 60 * 1000;

export type NotificationKind = AccountPreferences["notificationCategories"] extends infer Categories
  ? Categories extends Record<infer Key, boolean>
    ? Key
    : never
  : never;

export type ScheduleSnapshot = {
  ipoId: string;
  openDate: string | null;
  closeDate: string | null;
  allotmentDate: string | null;
  listingDate: string | null;
};

export type GmpReading = {
  amountRupees: number | null;
  observedAt: string;
  freshness: "fresh" | "stale" | "missing";
};

export type AlertIssue = {
  ipoId: string;
  companyName: string;
  status: IpoStatus | null;
  freshness: "fresh" | "stale" | "missing";
  openDate: string | null;
  closeDate: string | null;
  allotmentDate: string | null;
  listingDate: string | null;
  /** Newest first. Include stale readings so a stale latest can block an older pair. */
  gmp: readonly GmpReading[];
  subscriptionTotalTimes: number | null;
  subscriptionFreshness: "fresh" | "stale" | "missing" | null;
};

export type AlertCandidate = {
  type: NotificationKind;
  ipoId: string | null;
  title: string;
  body: string;
  dedupeKey: string;
};

export type AlertEvaluation = {
  candidates: AlertCandidate[];
  baselines: ScheduleSnapshot[];
};

function shiftIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days)).toISOString().slice(0, 10);
}

function sameSchedule(left: ScheduleSnapshot, right: ScheduleSnapshot): boolean {
  return left.openDate === right.openDate && left.closeDate === right.closeDate && left.allotmentDate === right.allotmentDate && left.listingDate === right.listingDate;
}

function snapshot(issue: AlertIssue): ScheduleSnapshot {
  return {
    ipoId: issue.ipoId,
    openDate: issue.openDate,
    closeDate: issue.closeDate,
    allotmentDate: issue.allotmentDate,
    listingDate: issue.listingDate,
  };
}

function dateChange(label: string, previous: string | null, next: string | null): string | null {
  if (previous === next) return null;
  if (previous && next) return `The ${label} changed from ${formatIstDate(previous)} to ${formatIstDate(next)}.`;
  if (next) return `A ${label} is now stored: ${formatIstDate(next)}.`;
  return `The ${label} is no longer stored.`;
}

function scheduleBody(previous: ScheduleSnapshot, next: ScheduleSnapshot): string {
  return [
    dateChange("open date", previous.openDate, next.openDate),
    dateChange("close date", previous.closeDate, next.closeDate),
    dateChange("allotment date", previous.allotmentDate, next.allotmentDate),
    dateChange("listing date", previous.listingDate, next.listingDate),
  ]
    .filter((line): line is string => line !== null)
    .join(" ");
}

function scheduleKey(next: ScheduleSnapshot): string {
  const part = (value: string | null) => value ?? "none";
  return `schedule:${next.ipoId}:${part(next.openDate)}:${part(next.closeDate)}:${part(next.allotmentDate)}:${part(next.listingDate)}`;
}

function timesLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function allowed(preferences: AccountPreferences, type: NotificationKind): boolean {
  return preferences.alertsEnabled && preferences.notificationCategories[type];
}

/** Hour in Asia/Kolkata. A stored IPO date has no clock, so this is only the job clock. */
function istHour(now: Date): number | null {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((part) => part.type === "hour")
    ?.value
    ?.trim();
  if (!hour || !/^\d{2}$/.test(hour)) return null;
  const value = Number(hour);
  if (value === 24) return 0;
  return value >= 0 && value <= 23 ? value : null;
}

function configuredCloseHour(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 23) return null;
  return value;
}

function fresh(issue: AlertIssue): boolean {
  return issue.freshness === "fresh";
}

/**
 * Builds in-app candidates from stored issue facts.
 * A missing date, a stale reading, or a first look at a schedule produces no event.
 */
export function evaluateAlerts(input: {
  now: Date;
  preferences: AccountPreferences;
  issues: readonly AlertIssue[];
  baselines: ReadonlyMap<string, ScheduleSnapshot>;
  /** Absolute rupee change required before a GMP notice. Defaults to the application threshold. */
  gmpChangeRupees?: number;
  /**
   * Optional IST hour for the about-1-hour close reminder.
   * IPO dates do not include a close time, so an unset hour sends no 1-hour reminder.
   */
  closeHourIst?: number | null;
}): AlertEvaluation {
  const today = istCalendarDate(input.now);
  const gmpThreshold = input.gmpChangeRupees ?? significantGmpChangeRupees;
  if (!today || !Number.isFinite(gmpThreshold) || gmpThreshold <= 0) return { candidates: [], baselines: [] };
  const tomorrow = shiftIsoDate(today, 1);
  const candidates: AlertCandidate[] = [];
  const baselines: ScheduleSnapshot[] = [];

  for (const issue of input.issues) {
    if (!fresh(issue)) continue;
    const next = snapshot(issue);
    const previous = input.baselines.get(issue.ipoId) ?? null;
    baselines.push(next);
    const name = issue.companyName.trim() || "This IPO";

    if (allowed(input.preferences, "open") && issue.openDate && issue.status !== "closed" && issue.status !== "allotment" && issue.status !== "listed") {
      if (issue.openDate === today) {
        candidates.push({
          type: "open",
          ipoId: issue.ipoId,
          title: `${name} opens today`,
          body: `${name} has a stored open date of ${formatIstDate(issue.openDate)}.`,
          dedupeKey: `open:${issue.ipoId}:${issue.openDate}`,
        });
      } else if (issue.openDate === tomorrow) {
        candidates.push({
          type: "open",
          ipoId: issue.ipoId,
          title: `${name} opens in about 24 hours`,
          body: `${name} has a stored open date of ${formatIstDate(issue.openDate)}.`,
          dedupeKey: `open:24h:${issue.ipoId}:${issue.openDate}`,
        });
      }
    }

    if (allowed(input.preferences, "closing") && issue.status !== "listed" && issue.closeDate) {
      if (issue.closeDate === tomorrow) {
        candidates.push({
          type: "closing",
          ipoId: issue.ipoId,
          title: `${name} closes in about 24 hours`,
          body: `${name} has a stored close date of ${formatIstDate(issue.closeDate)}.`,
          dedupeKey: `closing:24h:${issue.ipoId}:${issue.closeDate}`,
        });
      } else if (issue.closeDate === today) {
        const hour = configuredCloseHour(input.closeHourIst);
        const currentHour = istHour(input.now);
        if (hour !== null && currentHour === hour - 1) {
          candidates.push({
            type: "closing",
            ipoId: issue.ipoId,
            title: `${name} closes in about 1 hour`,
            body: `${name} has a stored close date of ${formatIstDate(issue.closeDate)}. This reminder is about one hour before ${String(hour).padStart(2, "0")}:00 IST. The stored date does not include a close time.`,
            dedupeKey: `closing:1h:${issue.ipoId}:${issue.closeDate}`,
          });
        } else {
          candidates.push({
            type: "closing",
            ipoId: issue.ipoId,
            title: `${name} closes today`,
            body: `${name} has a stored close date of ${formatIstDate(issue.closeDate)}.`,
            dedupeKey: `closing:today:${issue.ipoId}:${issue.closeDate}`,
          });
        }
      }
    }

    if (allowed(input.preferences, "allotment") && issue.allotmentDate === today) {
      candidates.push({
        type: "allotment",
        ipoId: issue.ipoId,
        title: `${name} allotment date is today`,
        body: `${name} has a stored allotment date of ${formatIstDate(issue.allotmentDate)}.`,
        dedupeKey: `allotment:${issue.ipoId}:${issue.allotmentDate}`,
      });
    }

    if (allowed(input.preferences, "listing") && issue.listingDate === today) {
      candidates.push({
        type: "listing",
        ipoId: issue.ipoId,
        title: `${name} listing date is today`,
        body: `${name} has a stored listing date of ${formatIstDate(issue.listingDate)}.`,
        dedupeKey: `listing:${issue.ipoId}:${issue.listingDate}`,
      });
    }

    if (allowed(input.preferences, "gmp")) {
      const newest = issue.gmp[0] ?? null;
      const freshAmounts = issue.gmp.filter((reading): reading is GmpReading & { amountRupees: number } => reading.freshness === "fresh" && reading.amountRupees !== null);
      const later = freshAmounts[0] ?? null;
      const earlier = freshAmounts[1] ?? null;
      if (newest?.freshness === "fresh" && newest.amountRupees !== null && later && earlier && Math.abs(later.amountRupees - earlier.amountRupees) >= gmpThreshold) {
        candidates.push({
          type: "gmp",
          ipoId: issue.ipoId,
          title: `GMP changed for ${name}`,
          body: `Unofficial GMP changed from ${formatInr(earlier.amountRupees)} to ${formatInr(later.amountRupees)}. This is not a recommendation or a listing forecast.`,
          dedupeKey: `gmp:${issue.ipoId}:${earlier.observedAt}:${later.observedAt}`,
        });
      }
    }

    if (allowed(input.preferences, "subscription") && issue.subscriptionFreshness === "fresh" && issue.subscriptionTotalTimes !== null) {
      const reached = subscriptionMilestones.filter((milestone) => issue.subscriptionTotalTimes !== null && issue.subscriptionTotalTimes >= milestone);
      const milestone = reached[reached.length - 1];
      if (milestone !== undefined) {
        candidates.push({
          type: "subscription",
          ipoId: issue.ipoId,
          title: `${name} subscription reached ${milestone} times`,
          body: `The stored subscription total is ${timesLabel(issue.subscriptionTotalTimes)} times.`,
          dedupeKey: `subscription:${issue.ipoId}:${milestone}`,
        });
      }
    }

    if (allowed(input.preferences, "schedule") && previous && !sameSchedule(previous, next)) {
      candidates.push({
        type: "schedule",
        ipoId: issue.ipoId,
        title: `Schedule changed for ${name}`,
        body: scheduleBody(previous, next),
        dedupeKey: scheduleKey(next),
      });
    }
  }

  return { candidates, baselines };
}

/** A staff-supplied announcement. Market data cannot create one. */
export function announcementCandidate(input: { key: string; title: string; body: string }): AlertCandidate | null {
  const title = input.title.trim();
  const body = input.body.trim();
  const key = input.key.trim();
  if (!title || !body || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || title.length > 120 || body.length > 500) return null;
  return {
    type: "announcement",
    ipoId: null,
    title,
    body,
    dedupeKey: `announcement:${key}`,
  };
}
