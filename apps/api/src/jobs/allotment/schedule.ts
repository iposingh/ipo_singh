import { istCalendarDate } from "@ipo-singh/core";

export type AllotmentVerifyPolicy = {
  /** Poll interval after monitoring has started (default 15 minutes). */
  pollIntervalMs: number;
  /** Stop scheduling this many days after allotment date (or close date fallback). */
  monitorDays: number;
  /** IST hour (0–23) when monitoring begins on the allotment date inclusive. Default 21 (9 PM IST). */
  monitorStartHourIst: number;
};

/** Hour-of-day in Asia/Kolkata for an instant. Returns null when the instant is invalid. */
export function istHour(now: Date): number | null {
  if (Number.isNaN(now.getTime())) return null;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now).find((part) => part.type === "hour")?.value,
  );
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

export function istMinute(now: Date): number | null {
  if (Number.isNaN(now.getTime())) return null;
  const minute = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      minute: "2-digit",
    }).formatToParts(now).find((part) => part.type === "minute")?.value,
  );
  return Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : null;
}

export const defaultAllotmentVerifyPolicy: AllotmentVerifyPolicy = {
  pollIntervalMs: 15 * 60 * 1000,
  monitorDays: 14,
  monitorStartHourIst: 21,
};

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** Anchor date for verification windows: allotment date, else day after close. */
export function allotmentMonitorAnchor(input: {
  allotmentDate: string | null;
  closeDate: string | null;
}): string | null {
  if (input.allotmentDate) return input.allotmentDate;
  if (input.closeDate) return addDays(input.closeDate, 1);
  return null;
}

/**
 * Instant when monitoring begins: 21:00 Asia/Kolkata on the anchor date.
 * India observes +05:30 year-round, so 21:00 IST is 15:30 UTC.
 */
export function allotmentMonitoringStartAt(anchorDate: string, policy?: AllotmentVerifyPolicy): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) return null;
  const hour = (policy ?? defaultAllotmentVerifyPolicy).monitorStartHourIst;
  const utcHour = hour - 5;
  const utcMinute = 30;
  // 21:00 IST => 15:30 UTC. For a general hour H IST: UTC = H - 5:30.
  const start = new Date(`${anchorDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  // Build from IST civil clock: Date for IST midnight+hour via explicit offset.
  const iso = `${anchorDate}T${String(hour).padStart(2, "0")}:00:00+05:30`;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    // Fallback for unusual hour values using the known IST offset.
    return new Date(Date.UTC(
      Number(anchorDate.slice(0, 4)),
      Number(anchorDate.slice(5, 7)) - 1,
      Number(anchorDate.slice(8, 10)),
      utcHour < 0 ? utcHour + 24 : utcHour,
      utcMinute,
    ));
  }
  return instant;
}

/**
 * Decide whether an unconfirmed, closed/allotment IPO is due for a registrar check.
 * Monitoring begins at 9:00 PM IST on the expected allotment date, then every 15 minutes.
 * Listed IPOs are never re-opened into allotment monitoring.
 */
export function planAllotmentCheck(input: {
  now: Date;
  allotmentDate: string | null;
  closeDate: string | null;
  allotmentConfirmed: boolean;
  status: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  policy?: AllotmentVerifyPolicy;
}): {
  due: boolean;
  nextCheckAt: string | null;
  intervalMs: number | null;
  reason: string;
  monitoringStartedAt: string | null;
} {
  const policy = input.policy ?? defaultAllotmentVerifyPolicy;
  if (input.allotmentConfirmed) {
    return { due: false, nextCheckAt: null, intervalMs: null, reason: "already-confirmed", monitoringStartedAt: null };
  }
  if (input.status === "listed") {
    return { due: false, nextCheckAt: null, intervalMs: null, reason: "listed", monitoringStartedAt: null };
  }
  if (input.status !== "closed" && input.status !== "allotment") {
    return { due: false, nextCheckAt: null, intervalMs: null, reason: "not-awaiting", monitoringStartedAt: null };
  }
  const today = istCalendarDate(input.now);
  const anchor = allotmentMonitorAnchor({ allotmentDate: input.allotmentDate, closeDate: input.closeDate });
  if (!today || !anchor) {
    return { due: false, nextCheckAt: null, intervalMs: null, reason: "missing-anchor", monitoringStartedAt: null };
  }
  const startAt = allotmentMonitoringStartAt(anchor, policy);
  if (!startAt) {
    return { due: false, nextCheckAt: null, intervalMs: null, reason: "missing-anchor", monitoringStartedAt: null };
  }
  const monitoringStartedAt = startAt.toISOString();
  if (input.now.getTime() < startAt.getTime()) {
    return {
      due: false,
      nextCheckAt: monitoringStartedAt,
      intervalMs: null,
      reason: "before-monitor-start",
      monitoringStartedAt,
    };
  }
  const ageDays = daysBetween(anchor, today);
  if (ageDays > policy.monitorDays) {
    return { due: false, nextCheckAt: null, intervalMs: null, reason: "monitor-expired", monitoringStartedAt };
  }
  const intervalMs = policy.pollIntervalMs;
  if (input.nextCheckAt) {
    const next = Date.parse(input.nextCheckAt);
    if (Number.isFinite(next) && input.now.getTime() < next) {
      return { due: false, nextCheckAt: input.nextCheckAt, intervalMs, reason: "waiting-next-check", monitoringStartedAt };
    }
  } else if (input.lastCheckedAt) {
    const last = Date.parse(input.lastCheckedAt);
    if (Number.isFinite(last) && input.now.getTime() - last < intervalMs) {
      const nextCheckAt = new Date(last + intervalMs).toISOString();
      return { due: false, nextCheckAt, intervalMs, reason: "interval-not-elapsed", monitoringStartedAt };
    }
  }
  return {
    due: true,
    nextCheckAt: new Date(input.now.getTime() + intervalMs).toISOString(),
    intervalMs,
    reason: "due",
    monitoringStartedAt,
  };
}
