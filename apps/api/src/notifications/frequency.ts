import { istCalendarDate } from "@ipo-singh/core";
import type { NotificationKind } from "./evaluate.ts";
import { isCriticalMainboardPush, notificationPriority } from "./eligibility.ts";

export type MainboardFrequencyPolicy = {
  /** Non-critical Mainboard pushes allowed per device owner per IST day. */
  maxNonCriticalPerDay: number;
};

export const defaultMainboardFrequencyPolicy: MainboardFrequencyPolicy = {
  maxNonCriticalPerDay: 3,
};

export type QueuedCandidate = {
  type: NotificationKind;
  ipoId: string | null;
  title: string;
  body: string;
  dedupeKey: string;
  board: "mainboard" | "sme";
};

export type FrequencyDecision =
  | { action: "deliver"; candidate: QueuedCandidate }
  | { action: "digest"; candidates: QueuedCandidate[] }
  | { action: "drop"; reason: "stale-window" | "unknown-board" };

/**
 * Apply Mainboard anti-spam: critical events always deliver (still subject to dedupe elsewhere).
 * Non-critical events fill a daily budget; overflow becomes one digest payload.
 */
export function planMainboardDeliveries(input: {
  now: Date;
  alreadySentNonCriticalToday: number;
  candidates: readonly QueuedCandidate[];
  policy?: MainboardFrequencyPolicy;
}): FrequencyDecision[] {
  const policy = input.policy ?? defaultMainboardFrequencyPolicy;
  const today = istCalendarDate(input.now);
  if (!today) return input.candidates.map(() => ({ action: "drop", reason: "stale-window" }));

  const ordered = input.candidates
    .slice()
    .sort((left, right) => notificationPriority(right.type) - notificationPriority(left.type) || left.dedupeKey.localeCompare(right.dedupeKey));

  const decisions: FrequencyDecision[] = [];
  let used = input.alreadySentNonCriticalToday;
  const deferred: QueuedCandidate[] = [];

  for (const candidate of ordered) {
    if (candidate.board !== "mainboard") {
      decisions.push({ action: "drop", reason: "unknown-board" });
      continue;
    }
    if (isCriticalMainboardPush(candidate.type)) {
      decisions.push({ action: "deliver", candidate });
      continue;
    }
    if (used < policy.maxNonCriticalPerDay) {
      decisions.push({ action: "deliver", candidate });
      used += 1;
      continue;
    }
    deferred.push(candidate);
  }

  if (deferred.length > 0) {
    decisions.push({ action: "digest", candidates: deferred });
  }
  return decisions;
}

export function mainboardDigestCandidate(input: {
  now: Date;
  candidates: readonly QueuedCandidate[];
}): QueuedCandidate | null {
  const today = istCalendarDate(input.now);
  if (!today || input.candidates.length === 0) return null;
  const titles = input.candidates
    .slice(0, 5)
    .map((item) => item.title)
    .join("; ");
  const more = input.candidates.length > 5 ? ` (+${input.candidates.length - 5} more)` : "";
  return {
    type: "announcement",
    ipoId: null,
    board: "mainboard",
    title: "Mainboard IPO updates",
    body: `Several Mainboard updates are ready today: ${titles}${more}. Open Mainboard listings for details.`,
    dedupeKey: `digest:mainboard:${today}:${input.candidates.map((item) => item.dedupeKey).sort().join("|").slice(0, 180)}`,
  };
}

/** Count of non-critical Mainboard push rows already created for an owner on an IST day. */
export function countNonCriticalMainboardToday(
  records: readonly { type: string; createdAt: Date; dedupeKey: string }[],
  now: Date,
): number {
  const today = istCalendarDate(now);
  if (!today) return 0;
  let count = 0;
  for (const record of records) {
    if (istCalendarDate(record.createdAt) !== today) continue;
    if (record.dedupeKey.startsWith("digest:mainboard:")) continue;
    if (isCriticalMainboardPush(record.type as NotificationKind)) continue;
    count += 1;
  }
  return count;
}
