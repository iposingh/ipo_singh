import { z } from "zod";
import { ConfigError } from "../shared/errors.ts";

export type AlertPolicy = {
  /** Absolute rupee move required between two fresh GMP readings. */
  gmpChangeRupees: number;
  /** Watchlist / owner rows read in one pass. */
  batchSize: number;
  maxAttempts: number;
  lockMs: number;
  /** IST hour for the about-1-hour close reminder. Null skips that reminder. */
  closeHourIst: number | null;
  /** Non-critical Mainboard pushes per owner per IST day before digesting. */
  mainboardMaxNonCriticalPerDay: number;
  /**
   * When false, the worker does not call Expo push or receipt APIs.
   * Keep false until physical-device delivery is verified.
   */
  pushDeliveryEnabled: boolean;
};

const alertEnvSchema = z
  .object({
    ALERT_GMP_CHANGE_RUPEES: z.coerce.number().int().min(1).max(10_000).default(10),
    ALERT_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(40),
    ALERT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
    ALERT_LOCK_MS: z.coerce.number().int().min(1_000).max(10 * 60 * 1000).default(60_000),
    ALERT_IPO_CLOSE_HOUR_IST: z.coerce.number().int().min(1).max(23).optional(),
    ALERT_MAINBOARD_MAX_NONCRITICAL_PER_DAY: z.coerce.number().int().min(0).max(20).default(3),
    PUSH_DELIVERY_ENABLED: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  })
  .strict();

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Alert limits are application choices. They do not call a data provider.
 */
export function readAlertPolicy(env: Record<string, string | undefined>): AlertPolicy {
  const parsed = alertEnvSchema.safeParse({
    ALERT_GMP_CHANGE_RUPEES: blankToUndefined(env.ALERT_GMP_CHANGE_RUPEES),
    ALERT_BATCH_SIZE: blankToUndefined(env.ALERT_BATCH_SIZE),
    ALERT_MAX_ATTEMPTS: blankToUndefined(env.ALERT_MAX_ATTEMPTS),
    ALERT_LOCK_MS: blankToUndefined(env.ALERT_LOCK_MS),
    ALERT_IPO_CLOSE_HOUR_IST: blankToUndefined(env.ALERT_IPO_CLOSE_HOUR_IST),
    ALERT_MAINBOARD_MAX_NONCRITICAL_PER_DAY: blankToUndefined(env.ALERT_MAINBOARD_MAX_NONCRITICAL_PER_DAY),
    PUSH_DELIVERY_ENABLED: blankToUndefined(env.PUSH_DELIVERY_ENABLED),
  });
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "environment")))].sort();
    throw new ConfigError(fields);
  }
  return {
    gmpChangeRupees: parsed.data.ALERT_GMP_CHANGE_RUPEES,
    batchSize: parsed.data.ALERT_BATCH_SIZE,
    maxAttempts: parsed.data.ALERT_MAX_ATTEMPTS,
    lockMs: parsed.data.ALERT_LOCK_MS,
    closeHourIst: parsed.data.ALERT_IPO_CLOSE_HOUR_IST ?? null,
    mainboardMaxNonCriticalPerDay: parsed.data.ALERT_MAINBOARD_MAX_NONCRITICAL_PER_DAY,
    pushDeliveryEnabled: parsed.data.PUSH_DELIVERY_ENABLED ?? false,
  };
}
