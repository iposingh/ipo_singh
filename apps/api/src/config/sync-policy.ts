import { z } from "zod";
import { ConfigError } from "../shared/errors.ts";

const dayMs = 24 * 60 * 60 * 1000;
const durationSchema = z.coerce.number().int().min(1_000).max(30 * dayMs);

export const syncCategories = ["catalog", "gmp", "subscription", "financial", "history"] as const;

export type SyncCategory = (typeof syncCategories)[number];

export type SyncPhase = "open" | "upcoming" | "listed" | "other";

export type PhaseIntervals = {
  openMs: number;
  upcomingMs: number;
  listedMs: number;
  otherMs: number;
};

export const gmpCollectionMinMs = 60 * 60 * 1000;
export const gmpCollectionMaxMs = 120 * 60 * 1000;
export const gmpCollectionDefaultMs = 90 * 60 * 1000;

export type SyncPolicy = {
  catalogMs: number;
  /** One `GET /gmp` collection poll. This is not a vendor update frequency. */
  gmpCollectionMs: number;
  gmp: PhaseIntervals;
  subscription: PhaseIntervals;
  financial: PhaseIntervals;
  history: PhaseIntervals;
  lockMs: number;
  maxCallsPerTick: number;
  tickMs: number;
};

const phaseSchema = z
  .object({
    openMs: durationSchema,
    upcomingMs: durationSchema,
    listedMs: durationSchema,
    otherMs: durationSchema,
  })
  .strict();

const syncEnvSchema = z
  .object({
    SYNC_CATALOG_MS: durationSchema.default(dayMs),
    SYNC_GMP_COLLECTION_MS: z.coerce.number().int().min(gmpCollectionMinMs).max(gmpCollectionMaxMs).default(gmpCollectionDefaultMs),
    SYNC_GMP_OPEN_MS: durationSchema.default(30 * 60 * 1000),
    SYNC_GMP_UPCOMING_MS: durationSchema.default(6 * 60 * 60 * 1000),
    SYNC_GMP_LISTED_MS: durationSchema.default(dayMs),
    SYNC_GMP_OTHER_MS: durationSchema.default(2 * 60 * 60 * 1000),
    SYNC_SUBSCRIPTION_OPEN_MS: durationSchema.default(60 * 60 * 1000),
    SYNC_SUBSCRIPTION_UPCOMING_MS: durationSchema.default(6 * 60 * 60 * 1000),
    SYNC_SUBSCRIPTION_LISTED_MS: durationSchema.default(dayMs),
    SYNC_SUBSCRIPTION_OTHER_MS: durationSchema.default(dayMs),
    SYNC_FINANCIAL_OPEN_MS: durationSchema.default(dayMs),
    SYNC_FINANCIAL_UPCOMING_MS: durationSchema.default(7 * dayMs),
    SYNC_FINANCIAL_LISTED_MS: durationSchema.default(7 * dayMs),
    SYNC_FINANCIAL_OTHER_MS: durationSchema.default(7 * dayMs),
    SYNC_HISTORY_OPEN_MS: durationSchema.default(6 * 60 * 60 * 1000),
    SYNC_HISTORY_UPCOMING_MS: durationSchema.default(dayMs),
    SYNC_HISTORY_LISTED_MS: durationSchema.default(7 * dayMs),
    SYNC_HISTORY_OTHER_MS: durationSchema.default(dayMs),
    SYNC_LOCK_MS: z.coerce.number().int().min(1_000).max(10 * 60 * 1000).default(60_000),
    SYNC_MAX_CALLS_PER_TICK: z.coerce.number().int().min(1).max(100).default(8),
    SYNC_TICK_MS: durationSchema.default(60_000),
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

function phase(openMs: number, upcomingMs: number, listedMs: number, otherMs: number, listedField: string, upcomingField: string, otherField: string): PhaseIntervals {
  const parsed = phaseSchema.safeParse({ openMs, upcomingMs, listedMs, otherMs });
  if (!parsed.success) throw new ConfigError(fieldsFromZod(parsed.error));
  if (parsed.data.upcomingMs < parsed.data.openMs) throw new ConfigError([upcomingField]);
  if (parsed.data.listedMs < parsed.data.openMs) throw new ConfigError([listedField]);
  if (parsed.data.otherMs < parsed.data.openMs) throw new ConfigError([otherField]);
  return parsed.data;
}

export function defaultSyncPolicy(): SyncPolicy {
  return readSyncPolicy({});
}

/**
 * Schedules are application choices. They are not a provider's update frequency.
 * Open issues are the shortest interval. Upcoming issues wait longer.
 * Listed issues wait at least as long as open issues.
 */
export function readSyncPolicy(env: Record<string, string | undefined>): SyncPolicy {
  const parsed = syncEnvSchema.safeParse({
    SYNC_CATALOG_MS: blankToUndefined(env.SYNC_CATALOG_MS),
    SYNC_GMP_COLLECTION_MS: blankToUndefined(env.SYNC_GMP_COLLECTION_MS),
    SYNC_GMP_OPEN_MS: blankToUndefined(env.SYNC_GMP_OPEN_MS),
    SYNC_GMP_UPCOMING_MS: blankToUndefined(env.SYNC_GMP_UPCOMING_MS),
    SYNC_GMP_LISTED_MS: blankToUndefined(env.SYNC_GMP_LISTED_MS),
    SYNC_GMP_OTHER_MS: blankToUndefined(env.SYNC_GMP_OTHER_MS),
    SYNC_SUBSCRIPTION_OPEN_MS: blankToUndefined(env.SYNC_SUBSCRIPTION_OPEN_MS),
    SYNC_SUBSCRIPTION_UPCOMING_MS: blankToUndefined(env.SYNC_SUBSCRIPTION_UPCOMING_MS),
    SYNC_SUBSCRIPTION_LISTED_MS: blankToUndefined(env.SYNC_SUBSCRIPTION_LISTED_MS),
    SYNC_SUBSCRIPTION_OTHER_MS: blankToUndefined(env.SYNC_SUBSCRIPTION_OTHER_MS),
    SYNC_FINANCIAL_OPEN_MS: blankToUndefined(env.SYNC_FINANCIAL_OPEN_MS),
    SYNC_FINANCIAL_UPCOMING_MS: blankToUndefined(env.SYNC_FINANCIAL_UPCOMING_MS),
    SYNC_FINANCIAL_LISTED_MS: blankToUndefined(env.SYNC_FINANCIAL_LISTED_MS),
    SYNC_FINANCIAL_OTHER_MS: blankToUndefined(env.SYNC_FINANCIAL_OTHER_MS),
    SYNC_HISTORY_OPEN_MS: blankToUndefined(env.SYNC_HISTORY_OPEN_MS),
    SYNC_HISTORY_UPCOMING_MS: blankToUndefined(env.SYNC_HISTORY_UPCOMING_MS),
    SYNC_HISTORY_LISTED_MS: blankToUndefined(env.SYNC_HISTORY_LISTED_MS),
    SYNC_HISTORY_OTHER_MS: blankToUndefined(env.SYNC_HISTORY_OTHER_MS),
    SYNC_LOCK_MS: blankToUndefined(env.SYNC_LOCK_MS),
    SYNC_MAX_CALLS_PER_TICK: blankToUndefined(env.SYNC_MAX_CALLS_PER_TICK),
    SYNC_TICK_MS: blankToUndefined(env.SYNC_TICK_MS),
  });
  if (!parsed.success) throw new ConfigError(fieldsFromZod(parsed.error));
  const data = parsed.data;
  return {
    catalogMs: data.SYNC_CATALOG_MS,
    gmpCollectionMs: data.SYNC_GMP_COLLECTION_MS,
    gmp: phase(data.SYNC_GMP_OPEN_MS, data.SYNC_GMP_UPCOMING_MS, data.SYNC_GMP_LISTED_MS, data.SYNC_GMP_OTHER_MS, "SYNC_GMP_LISTED_MS", "SYNC_GMP_UPCOMING_MS", "SYNC_GMP_OTHER_MS"),
    subscription: phase(
      data.SYNC_SUBSCRIPTION_OPEN_MS,
      data.SYNC_SUBSCRIPTION_UPCOMING_MS,
      data.SYNC_SUBSCRIPTION_LISTED_MS,
      data.SYNC_SUBSCRIPTION_OTHER_MS,
      "SYNC_SUBSCRIPTION_LISTED_MS",
      "SYNC_SUBSCRIPTION_UPCOMING_MS",
      "SYNC_SUBSCRIPTION_OTHER_MS",
    ),
    financial: phase(
      data.SYNC_FINANCIAL_OPEN_MS,
      data.SYNC_FINANCIAL_UPCOMING_MS,
      data.SYNC_FINANCIAL_LISTED_MS,
      data.SYNC_FINANCIAL_OTHER_MS,
      "SYNC_FINANCIAL_LISTED_MS",
      "SYNC_FINANCIAL_UPCOMING_MS",
      "SYNC_FINANCIAL_OTHER_MS",
    ),
    history: phase(
      data.SYNC_HISTORY_OPEN_MS,
      data.SYNC_HISTORY_UPCOMING_MS,
      data.SYNC_HISTORY_LISTED_MS,
      data.SYNC_HISTORY_OTHER_MS,
      "SYNC_HISTORY_LISTED_MS",
      "SYNC_HISTORY_UPCOMING_MS",
      "SYNC_HISTORY_OTHER_MS",
    ),
    lockMs: data.SYNC_LOCK_MS,
    maxCallsPerTick: data.SYNC_MAX_CALLS_PER_TICK,
    tickMs: data.SYNC_TICK_MS,
  };
}
