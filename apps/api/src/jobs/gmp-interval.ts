import { resolveFreshness } from "@ipo-singh/core";
import { gmpCollectionMaxMs, gmpCollectionMinMs } from "../config/sync-policy.ts";

export type GmpCollectionReading = "fresh" | "stale" | "missing";

/**
 * Starting interval is the configured 60–120 minute value.
 * A tight day budget waits the full 120 minutes.
 * A stale or missing reading for an open or upcoming issue uses 60 minutes when budget remains.
 * Neither choice is a claim about how often the provider publishes a new premium.
 */
export function gmpCollectionIntervalMs(input: {
  configuredMs: number;
  reading: GmpCollectionReading;
  dayUsed: number | null;
  requestsPerDay: number;
  reservedRequests: number;
}): number {
  const remaining = input.dayUsed === null ? null : input.requestsPerDay - input.dayUsed;
  if (remaining !== null && remaining <= input.reservedRequests) return gmpCollectionMaxMs;
  if (input.reading === "stale" || input.reading === "missing") return gmpCollectionMinMs;
  return input.configuredMs;
}

/** Fresh means every open and upcoming issue has a premium newer than the starting interval. */
export function gmpCollectionReading(input: {
  liveCount: number;
  observedAt: readonly (Date | null)[];
  now: Date;
  freshMs: number;
}): GmpCollectionReading {
  if (input.liveCount === 0) return "fresh";
  if (input.observedAt.length < input.liveCount || input.observedAt.some((stamp) => stamp === null)) return "missing";
  const stale = input.observedAt.some((stamp) => resolveFreshness(stamp, input.now, input.freshMs) !== "fresh");
  return stale ? "stale" : "fresh";
}
