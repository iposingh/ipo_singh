import { z } from "zod";
import { ConfigError } from "../shared/errors.ts";

export const cacheResources = ["gmp", "subscription", "listings", "issue", "history", "registrars", "listing"] as const;

export type CacheResource = (typeof cacheResources)[number];
export type CacheNamespace = "provider" | "public";

export type CacheDurations = {
  freshMs: number;
  staleMs: number;
};

export type CachePolicy = {
  version: number;
  /** Isolates Redis keys across development / staging / production on a shared instance. */
  environment: string;
  resources: Record<CacheResource, CacheDurations>;
  /** Used while bidding is open and the close is not yet inside the closing lead. */
  subscriptionClosingFreshMs: number;
  /** Used after the bidding close instant. */
  subscriptionClosedFreshMs: number;
  /** How long before close the shorter subscription TTL applies. */
  subscriptionClosingLeadMs: number;
  /** Minute of the Asia/Kolkata day when the IPO directory is due for refresh. */
  directoryRefreshMinute: number;
  /** Asia/Kolkata minutes on the listing date, including the 10:00 refresh and follow-ups. */
  listingRefreshMinutes: readonly number[];
  lockMs: number;
  waitMs: number;
  missStormLimit: number;
  missStormWindowMs: number;
};

const dayMs = 24 * 60 * 60 * 1000;
const durationSchema = z.coerce.number().int().min(1).max(30 * dayMs);
const clockSchema = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const cacheEnvSchema = z
  .object({
    CACHE_KEY_VERSION: z.coerce.number().int().min(1).max(100).default(1),
    CACHE_TTL_GMP_MS: durationSchema.default(120 * 60 * 1000),
    CACHE_TTL_SUBSCRIPTION_MS: durationSchema.default(60 * 60 * 1000),
    CACHE_TTL_SUBSCRIPTION_CLOSING_MS: durationSchema.default(30 * 60 * 1000),
    CACHE_TTL_SUBSCRIPTION_CLOSED_MS: durationSchema.default(dayMs),
    CACHE_SUBSCRIPTION_CLOSING_LEAD_MS: durationSchema.default(2 * 60 * 60 * 1000),
    CACHE_TTL_LISTINGS_MS: durationSchema.default(dayMs),
    CACHE_TTL_ISSUE_MS: durationSchema.default(dayMs),
    CACHE_TTL_HISTORY_MS: durationSchema.default(7 * dayMs),
    CACHE_TTL_REGISTRAR_MS: durationSchema.default(dayMs),
    CACHE_TTL_LISTING_MS: durationSchema.default(dayMs),
    CACHE_STALE_GMP_MS: durationSchema.default(dayMs),
    CACHE_STALE_SUBSCRIPTION_MS: durationSchema.default(7 * dayMs),
    CACHE_STALE_LISTINGS_MS: durationSchema.default(7 * dayMs),
    CACHE_STALE_ISSUE_MS: durationSchema.default(7 * dayMs),
    CACHE_STALE_HISTORY_MS: durationSchema.default(30 * dayMs),
    CACHE_STALE_REGISTRAR_MS: durationSchema.default(7 * dayMs),
    CACHE_STALE_LISTING_MS: durationSchema.default(7 * dayMs),
    CACHE_DIRECTORY_REFRESH_IST: clockSchema.default("08:00"),
    CACHE_LISTING_REFRESH_IST: clockSchema.default("10:00"),
    CACHE_LISTING_FOLLOW_UP_IST: z.string().trim().default("11:00,15:45"),
    CACHE_LOCK_MS: durationSchema.default(10_000),
    CACHE_WAIT_MS: durationSchema.default(1_000),
    CACHE_MISS_STORM_LIMIT: z.coerce.number().int().min(1).max(10_000).default(20),
    CACHE_MISS_STORM_WINDOW_MS: durationSchema.default(10_000),
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

function staleField(resource: string): string {
  if (resource === "registrars") return "CACHE_STALE_REGISTRAR_MS";
  return `CACHE_STALE_${resource.toUpperCase()}_MS`;
}

export function clockMinute(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function listingMinutes(primary: string, followUps: string): readonly number[] {
  const first = clockMinute(primary);
  if (first === null) throw new ConfigError(["CACHE_LISTING_REFRESH_IST"]);
  const minutes = [first];
  if (!followUps.trim()) return minutes;
  for (const part of followUps.split(",")) {
    const minute = clockMinute(part.trim());
    if (minute === null || minutes.includes(minute)) throw new ConfigError(["CACHE_LISTING_FOLLOW_UP_IST"]);
    minutes.push(minute);
  }
  return [...minutes].sort((left, right) => left - right);
}

export function defaultCachePolicy(): CachePolicy {
  return readCachePolicy({}, "dev");
}

/** TTLs and clock times are application choices. They are not a provider's update frequency. */
export function readCachePolicy(env: Record<string, string | undefined>, environment = "dev"): CachePolicy {
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(environment)) throw new ConfigError(["IPO_SINGH_DEPLOYMENT"]);
  const parsed = cacheEnvSchema.safeParse({
    CACHE_KEY_VERSION: blankToUndefined(env.CACHE_KEY_VERSION),
    CACHE_TTL_GMP_MS: blankToUndefined(env.CACHE_TTL_GMP_MS),
    CACHE_TTL_SUBSCRIPTION_MS: blankToUndefined(env.CACHE_TTL_SUBSCRIPTION_MS),
    CACHE_TTL_SUBSCRIPTION_CLOSING_MS: blankToUndefined(env.CACHE_TTL_SUBSCRIPTION_CLOSING_MS),
    CACHE_TTL_SUBSCRIPTION_CLOSED_MS: blankToUndefined(env.CACHE_TTL_SUBSCRIPTION_CLOSED_MS),
    CACHE_SUBSCRIPTION_CLOSING_LEAD_MS: blankToUndefined(env.CACHE_SUBSCRIPTION_CLOSING_LEAD_MS),
    CACHE_TTL_LISTINGS_MS: blankToUndefined(env.CACHE_TTL_LISTINGS_MS),
    CACHE_TTL_ISSUE_MS: blankToUndefined(env.CACHE_TTL_ISSUE_MS),
    CACHE_TTL_HISTORY_MS: blankToUndefined(env.CACHE_TTL_HISTORY_MS),
    CACHE_TTL_REGISTRAR_MS: blankToUndefined(env.CACHE_TTL_REGISTRAR_MS),
    CACHE_TTL_LISTING_MS: blankToUndefined(env.CACHE_TTL_LISTING_MS),
    CACHE_STALE_GMP_MS: blankToUndefined(env.CACHE_STALE_GMP_MS),
    CACHE_STALE_SUBSCRIPTION_MS: blankToUndefined(env.CACHE_STALE_SUBSCRIPTION_MS),
    CACHE_STALE_LISTINGS_MS: blankToUndefined(env.CACHE_STALE_LISTINGS_MS),
    CACHE_STALE_ISSUE_MS: blankToUndefined(env.CACHE_STALE_ISSUE_MS),
    CACHE_STALE_HISTORY_MS: blankToUndefined(env.CACHE_STALE_HISTORY_MS),
    CACHE_STALE_REGISTRAR_MS: blankToUndefined(env.CACHE_STALE_REGISTRAR_MS),
    CACHE_STALE_LISTING_MS: blankToUndefined(env.CACHE_STALE_LISTING_MS),
    CACHE_DIRECTORY_REFRESH_IST: blankToUndefined(env.CACHE_DIRECTORY_REFRESH_IST),
    CACHE_LISTING_REFRESH_IST: blankToUndefined(env.CACHE_LISTING_REFRESH_IST),
    CACHE_LISTING_FOLLOW_UP_IST: env.CACHE_LISTING_FOLLOW_UP_IST?.trim(),
    CACHE_LOCK_MS: blankToUndefined(env.CACHE_LOCK_MS),
    CACHE_WAIT_MS: blankToUndefined(env.CACHE_WAIT_MS),
    CACHE_MISS_STORM_LIMIT: blankToUndefined(env.CACHE_MISS_STORM_LIMIT),
    CACHE_MISS_STORM_WINDOW_MS: blankToUndefined(env.CACHE_MISS_STORM_WINDOW_MS),
  });
  if (!parsed.success) throw new ConfigError(fieldsFromZod(parsed.error));

  const directoryRefreshMinute = clockMinute(parsed.data.CACHE_DIRECTORY_REFRESH_IST);
  if (directoryRefreshMinute === null) throw new ConfigError(["CACHE_DIRECTORY_REFRESH_IST"]);

  const resources = {
    gmp: { freshMs: parsed.data.CACHE_TTL_GMP_MS, staleMs: parsed.data.CACHE_STALE_GMP_MS },
    subscription: { freshMs: parsed.data.CACHE_TTL_SUBSCRIPTION_MS, staleMs: parsed.data.CACHE_STALE_SUBSCRIPTION_MS },
    listings: { freshMs: parsed.data.CACHE_TTL_LISTINGS_MS, staleMs: parsed.data.CACHE_STALE_LISTINGS_MS },
    issue: { freshMs: parsed.data.CACHE_TTL_ISSUE_MS, staleMs: parsed.data.CACHE_STALE_ISSUE_MS },
    history: { freshMs: parsed.data.CACHE_TTL_HISTORY_MS, staleMs: parsed.data.CACHE_STALE_HISTORY_MS },
    registrars: { freshMs: parsed.data.CACHE_TTL_REGISTRAR_MS, staleMs: parsed.data.CACHE_STALE_REGISTRAR_MS },
    listing: { freshMs: parsed.data.CACHE_TTL_LISTING_MS, staleMs: parsed.data.CACHE_STALE_LISTING_MS },
  } satisfies Record<CacheResource, CacheDurations>;

  for (const [resource, duration] of Object.entries(resources)) {
    if (duration.staleMs < duration.freshMs) throw new ConfigError([staleField(resource)]);
  }
  if (parsed.data.CACHE_TTL_SUBSCRIPTION_CLOSING_MS > resources.subscription.freshMs) {
    throw new ConfigError(["CACHE_TTL_SUBSCRIPTION_CLOSING_MS"]);
  }
  if (parsed.data.CACHE_TTL_SUBSCRIPTION_CLOSED_MS > resources.subscription.staleMs) {
    throw new ConfigError(["CACHE_TTL_SUBSCRIPTION_CLOSED_MS"]);
  }

  return {
    version: parsed.data.CACHE_KEY_VERSION,
    environment,
    resources,
    subscriptionClosingFreshMs: parsed.data.CACHE_TTL_SUBSCRIPTION_CLOSING_MS,
    subscriptionClosedFreshMs: parsed.data.CACHE_TTL_SUBSCRIPTION_CLOSED_MS,
    subscriptionClosingLeadMs: parsed.data.CACHE_SUBSCRIPTION_CLOSING_LEAD_MS,
    directoryRefreshMinute,
    listingRefreshMinutes: listingMinutes(parsed.data.CACHE_LISTING_REFRESH_IST, parsed.data.CACHE_LISTING_FOLLOW_UP_IST),
    lockMs: parsed.data.CACHE_LOCK_MS,
    waitMs: parsed.data.CACHE_WAIT_MS,
    missStormLimit: parsed.data.CACHE_MISS_STORM_LIMIT,
    missStormWindowMs: parsed.data.CACHE_MISS_STORM_WINDOW_MS,
  };
}

export type BiddingPhase = "active" | "closing" | "closed" | "unknown";

/** Unknown close times stay on the active TTL. A missing close is not treated as near closure. */
export function biddingPhase(now: Date, closeAt: Date | null, leadMs: number): BiddingPhase {
  if (!(closeAt instanceof Date) || Number.isNaN(closeAt.getTime())) return "unknown";
  if (now.getTime() >= closeAt.getTime()) return "closed";
  if (closeAt.getTime() - now.getTime() <= leadMs) return "closing";
  return "active";
}

export function subscriptionFreshMs(policy: CachePolicy, phase: BiddingPhase): number {
  if (phase === "closing") return policy.subscriptionClosingFreshMs;
  if (phase === "closed") return policy.subscriptionClosedFreshMs;
  return policy.resources.subscription.freshMs;
}
