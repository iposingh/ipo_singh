import { z } from "zod";
import { ConfigError } from "../shared/errors.ts";
import type { SyncPolicy } from "./sync-policy.ts";

const dayMs = 24 * 60 * 60 * 1000;
const durationSchema = z.coerce.number().int().min(1_000).max(30 * dayMs);
const minuteSchema = z.coerce.number().int().min(0).max(23 * 60 + 59);

export type IstMinuteWindow = {
  /** Inclusive start minute of the Asia/Kolkata day (0 = 00:00, 1260 = 21:00). */
  startMinute: number;
  /**
   * Inclusive end minute of the Asia/Kolkata day.
   * When endMinute < startMinute the window wraps past midnight
   * (for example allotment 21:00–01:00 → start 1260, end 60).
   */
  endMinute: number;
};

export type CronPolicy = {
  /** Catalogue refresh while inside the catalogue window. Default 30 minutes. */
  catalogIntervalMs: number;
  /**
   * Desired GMP collection cadence while inside the GMP window.
   * The sync engine still respects SYNC_GMP_COLLECTION_MS (60–120 minutes).
   */
  gmpIntervalMs: number;
  /** Active (open) subscription cadence while inside the subscription window. Default 10 minutes. */
  subscriptionIntervalMs: number;
  /** IPO detail / financial cadence while inside the detail window. Default 2 hours. */
  detailIntervalMs: number;
  /** Allotment verification poll cadence while inside an allotment window. Default 15 minutes. */
  allotmentIntervalMs: number;
  catalogWindow: IstMinuteWindow;
  gmpWindow: IstMinuteWindow;
  subscriptionWindow: IstMinuteWindow;
  detailWindow: IstMinuteWindow;
  historyWindow: IstMinuteWindow;
  /** Primary overnight allotment window (wraps midnight). Default 21:00–01:00 IST. */
  allotmentOvernightWindow: IstMinuteWindow;
  /** Morning follow-up when overnight checks left results pending. Default 08:00–10:00 IST. */
  allotmentMorningWindow: IstMinuteWindow;
  /** Whole-pass distributed lock TTL. Default 4 minutes (under the 5-minute Render schedule). */
  passLockMs: number;
  /** Provider call budget for one cron invocation. */
  maxCallsPerPass: number;
};

const cronEnvSchema = z
  .object({
    CRON_CATALOG_INTERVAL_MS: durationSchema.default(30 * 60 * 1000),
    CRON_GMP_INTERVAL_MS: durationSchema.default(30 * 60 * 1000),
    CRON_SUBSCRIPTION_INTERVAL_MS: durationSchema.default(10 * 60 * 1000),
    CRON_DETAIL_INTERVAL_MS: durationSchema.default(2 * 60 * 60 * 1000),
    CRON_ALLOTMENT_INTERVAL_MS: durationSchema.default(15 * 60 * 1000),
    CRON_CATALOG_START_MINUTE: minuteSchema.default(9 * 60),
    CRON_CATALOG_END_MINUTE: minuteSchema.default(18 * 60),
    CRON_GMP_START_MINUTE: minuteSchema.default(9 * 60),
    CRON_GMP_END_MINUTE: minuteSchema.default(17 * 60),
    CRON_SUBSCRIPTION_START_MINUTE: minuteSchema.default(10 * 60),
    CRON_SUBSCRIPTION_END_MINUTE: minuteSchema.default(17 * 60),
    CRON_DETAIL_START_MINUTE: minuteSchema.default(9 * 60),
    CRON_DETAIL_END_MINUTE: minuteSchema.default(18 * 60),
    CRON_HISTORY_START_MINUTE: minuteSchema.default(9 * 60),
    CRON_HISTORY_END_MINUTE: minuteSchema.default(18 * 60),
    CRON_ALLOTMENT_OVERNIGHT_START_MINUTE: minuteSchema.default(21 * 60),
    CRON_ALLOTMENT_OVERNIGHT_END_MINUTE: minuteSchema.default(1 * 60),
    CRON_ALLOTMENT_MORNING_START_MINUTE: minuteSchema.default(8 * 60),
    CRON_ALLOTMENT_MORNING_END_MINUTE: minuteSchema.default(10 * 60),
    CRON_PASS_LOCK_MS: z.coerce.number().int().min(30_000).max(10 * 60 * 1000).default(4 * 60 * 1000),
    CRON_MAX_CALLS_PER_PASS: z.coerce.number().int().min(1).max(100).default(8),
  })
  .strict();

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function fieldsFromZod(error: z.ZodError): string[] {
  const fields = new Set<string>();
  for (const issue of error.issues) {
    const name = issue.path[0];
    fields.add(typeof name === "string" ? name : "environment");
  }
  return [...fields].sort();
}

export function defaultCronPolicy(): CronPolicy {
  return readCronPolicy({});
}

/**
 * Render Cron wakes every five minutes on a UTC cron expression.
 * These windows and intervals are evaluated in Asia/Kolkata independently of the host clock.
 */
export function readCronPolicy(env: Record<string, string | undefined>): CronPolicy {
  const parsed = cronEnvSchema.safeParse({
    CRON_CATALOG_INTERVAL_MS: blankToUndefined(env.CRON_CATALOG_INTERVAL_MS),
    CRON_GMP_INTERVAL_MS: blankToUndefined(env.CRON_GMP_INTERVAL_MS),
    CRON_SUBSCRIPTION_INTERVAL_MS: blankToUndefined(env.CRON_SUBSCRIPTION_INTERVAL_MS),
    CRON_DETAIL_INTERVAL_MS: blankToUndefined(env.CRON_DETAIL_INTERVAL_MS),
    CRON_ALLOTMENT_INTERVAL_MS: blankToUndefined(env.CRON_ALLOTMENT_INTERVAL_MS),
    CRON_CATALOG_START_MINUTE: blankToUndefined(env.CRON_CATALOG_START_MINUTE),
    CRON_CATALOG_END_MINUTE: blankToUndefined(env.CRON_CATALOG_END_MINUTE),
    CRON_GMP_START_MINUTE: blankToUndefined(env.CRON_GMP_START_MINUTE),
    CRON_GMP_END_MINUTE: blankToUndefined(env.CRON_GMP_END_MINUTE),
    CRON_SUBSCRIPTION_START_MINUTE: blankToUndefined(env.CRON_SUBSCRIPTION_START_MINUTE),
    CRON_SUBSCRIPTION_END_MINUTE: blankToUndefined(env.CRON_SUBSCRIPTION_END_MINUTE),
    CRON_DETAIL_START_MINUTE: blankToUndefined(env.CRON_DETAIL_START_MINUTE),
    CRON_DETAIL_END_MINUTE: blankToUndefined(env.CRON_DETAIL_END_MINUTE),
    CRON_HISTORY_START_MINUTE: blankToUndefined(env.CRON_HISTORY_START_MINUTE),
    CRON_HISTORY_END_MINUTE: blankToUndefined(env.CRON_HISTORY_END_MINUTE),
    CRON_ALLOTMENT_OVERNIGHT_START_MINUTE: blankToUndefined(env.CRON_ALLOTMENT_OVERNIGHT_START_MINUTE),
    CRON_ALLOTMENT_OVERNIGHT_END_MINUTE: blankToUndefined(env.CRON_ALLOTMENT_OVERNIGHT_END_MINUTE),
    CRON_ALLOTMENT_MORNING_START_MINUTE: blankToUndefined(env.CRON_ALLOTMENT_MORNING_START_MINUTE),
    CRON_ALLOTMENT_MORNING_END_MINUTE: blankToUndefined(env.CRON_ALLOTMENT_MORNING_END_MINUTE),
    CRON_PASS_LOCK_MS: blankToUndefined(env.CRON_PASS_LOCK_MS),
    CRON_MAX_CALLS_PER_PASS: blankToUndefined(env.CRON_MAX_CALLS_PER_PASS),
  });
  if (!parsed.success) throw new ConfigError(fieldsFromZod(parsed.error));
  const data = parsed.data;
  return {
    catalogIntervalMs: data.CRON_CATALOG_INTERVAL_MS,
    gmpIntervalMs: data.CRON_GMP_INTERVAL_MS,
    subscriptionIntervalMs: data.CRON_SUBSCRIPTION_INTERVAL_MS,
    detailIntervalMs: data.CRON_DETAIL_INTERVAL_MS,
    allotmentIntervalMs: data.CRON_ALLOTMENT_INTERVAL_MS,
    catalogWindow: { startMinute: data.CRON_CATALOG_START_MINUTE, endMinute: data.CRON_CATALOG_END_MINUTE },
    gmpWindow: { startMinute: data.CRON_GMP_START_MINUTE, endMinute: data.CRON_GMP_END_MINUTE },
    subscriptionWindow: { startMinute: data.CRON_SUBSCRIPTION_START_MINUTE, endMinute: data.CRON_SUBSCRIPTION_END_MINUTE },
    detailWindow: { startMinute: data.CRON_DETAIL_START_MINUTE, endMinute: data.CRON_DETAIL_END_MINUTE },
    historyWindow: { startMinute: data.CRON_HISTORY_START_MINUTE, endMinute: data.CRON_HISTORY_END_MINUTE },
    allotmentOvernightWindow: {
      startMinute: data.CRON_ALLOTMENT_OVERNIGHT_START_MINUTE,
      endMinute: data.CRON_ALLOTMENT_OVERNIGHT_END_MINUTE,
    },
    allotmentMorningWindow: {
      startMinute: data.CRON_ALLOTMENT_MORNING_START_MINUTE,
      endMinute: data.CRON_ALLOTMENT_MORNING_END_MINUTE,
    },
    passLockMs: data.CRON_PASS_LOCK_MS,
    maxCallsPerPass: data.CRON_MAX_CALLS_PER_PASS,
  };
}

/**
 * Sync intervals for a cron pass. Keeps GMP collection bounds from the base sync policy
 * (vendor-safe 60–120 minutes) while applying cron catalogue / subscription / detail cadences.
 */
export function syncPolicyForCronPass(base: SyncPolicy, cron: CronPolicy): SyncPolicy {
  return {
    ...base,
    catalogMs: cron.catalogIntervalMs,
    subscription: {
      ...base.subscription,
      openMs: cron.subscriptionIntervalMs,
      // Recently listed catch-up uses the listed phase; keep it bounded to the detail cadence.
      listedMs: Math.max(base.subscription.listedMs, cron.detailIntervalMs),
    },
    financial: {
      ...base.financial,
      openMs: cron.detailIntervalMs,
      upcomingMs: Math.max(base.financial.upcomingMs, cron.detailIntervalMs),
      // Allotment/closed rows missing a company narrative need a faster retry than seven days.
      otherMs: cron.detailIntervalMs,
      listedMs: cron.detailIntervalMs,
    },
    history: {
      ...base.history,
      listedMs: Math.max(base.history.listedMs, cron.detailIntervalMs),
    },
    lockMs: Math.max(base.lockMs, Math.min(cron.passLockMs, 60_000)),
    maxCallsPerTick: cron.maxCallsPerPass,
    tickMs: base.tickMs,
  };
}
