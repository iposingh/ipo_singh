import type { IpoSummary } from "@ipo-singh/contracts";
import { formatIstDateTime } from "@ipo-singh/core";
import { gmpDisplayFreshness } from "./gmp-summary.ts";

/** One stamp when every value matches. Mixed or partial stamps stay on each record. */
export function sharedStamp(values: readonly (string | null | undefined)[]): string | null | "mixed" {
  if (values.length === 0) return null;
  const present = values.filter((value): value is string => Boolean(value));
  if (present.length !== values.length) return present.length === 0 ? null : "mixed";
  const first = present[0];
  return first && present.every((value) => value === first) ? first : "mixed";
}

export function formatSourceStamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const text = formatIstDateTime(date);
  return text === "Unavailable" ? null : text;
}

export function gmpDelay(ipo: Pick<IpoSummary, "gmpObservedAt">, now: Date): "delayed" | "current" | "unknown" {
  if (!ipo.gmpObservedAt) return "unknown";
  const freshness = gmpDisplayFreshness(ipo.gmpObservedAt, now);
  if (freshness === "missing") return "unknown";
  return freshness === "stale" ? "delayed" : "current";
}
