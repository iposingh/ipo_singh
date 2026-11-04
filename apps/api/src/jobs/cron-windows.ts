import type { CronPolicy, IstMinuteWindow } from "../config/cron-policy.ts";
import { istMinutes } from "./ist.ts";
import { syncDue } from "./schedule.ts";

/**
 * Whether `minuteOfDay` (Asia/Kolkata) falls inside `window`, including wrap-past-midnight windows.
 * Both ends are inclusive so a final overnight allotment check at 01:00 IST is eligible.
 */
export function isWithinIstWindow(minuteOfDay: number, window: IstMinuteWindow): boolean {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= 24 * 60) return false;
  if (window.startMinute <= window.endMinute) {
    return minuteOfDay >= window.startMinute && minuteOfDay <= window.endMinute;
  }
  return minuteOfDay >= window.startMinute || minuteOfDay <= window.endMinute;
}

export function istMinuteOfDay(now: Date): number | null {
  return istMinutes(now);
}

export function isTaskWindowOpen(now: Date, window: IstMinuteWindow): boolean {
  const minute = istMinuteOfDay(now);
  if (minute === null) return false;
  return isWithinIstWindow(minute, window);
}

/**
 * Window open and the configured interval has elapsed since the last success.
 * Missing or invalid lastSuccessAt means due when the window is open.
 */
export function isTaskDue(input: {
  now: Date;
  window: IstMinuteWindow;
  intervalMs: number;
  lastSuccessAt: Date | null;
}): boolean {
  if (!isTaskWindowOpen(input.now, input.window)) return false;
  return syncDue(input.lastSuccessAt, input.intervalMs, input.now);
}

/** Overnight allotment window (9 PM–1 AM IST) or configurable morning follow-up. */
export function isAllotmentCronWindowOpen(now: Date, policy: CronPolicy): boolean {
  return (
    isTaskWindowOpen(now, policy.allotmentOvernightWindow) ||
    isTaskWindowOpen(now, policy.allotmentMorningWindow)
  );
}

export type CronTaskGates = {
  catalog: boolean;
  gmpCollection: boolean;
  subscriptionCurrent: boolean;
  gmpHistory: boolean;
  subscriptionHistory: boolean;
  ipoDetail: boolean;
  allotment: boolean;
  alerts: boolean;
};

/**
 * Decide which work a single five-minute cron wake should attempt.
 * Alerts always run (they do not call IPO Guru). Provider tasks require an open IST window;
 * per-resource TTLs inside the sync engine still decide whether a call is issued.
 */
export function planCronTaskGates(input: {
  now: Date;
  policy: CronPolicy;
  allotmentVerifyEnabled: boolean;
  providerReady: boolean;
}): CronTaskGates {
  const { now, policy } = input;
  const daytimeProvider = input.providerReady;
  return {
    catalog: daytimeProvider && isTaskWindowOpen(now, policy.catalogWindow),
    gmpCollection: daytimeProvider && isTaskWindowOpen(now, policy.gmpWindow),
    subscriptionCurrent: daytimeProvider && isTaskWindowOpen(now, policy.subscriptionWindow),
    gmpHistory: daytimeProvider && isTaskWindowOpen(now, policy.historyWindow),
    subscriptionHistory: daytimeProvider && isTaskWindowOpen(now, policy.historyWindow),
    ipoDetail: daytimeProvider && isTaskWindowOpen(now, policy.detailWindow),
    allotment: input.allotmentVerifyEnabled && isAllotmentCronWindowOpen(now, policy),
    alerts: true,
  };
}
