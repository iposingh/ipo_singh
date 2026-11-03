export const defaultStaleAfterMs = 15 * 60 * 1000;

export type Freshness = "missing" | "fresh" | "stale";

export function resolveFreshness(
  updatedAt: Date | null | undefined,
  now: Date,
  staleAfterMs = defaultStaleAfterMs,
): Freshness {
  if (!(updatedAt instanceof Date) || Number.isNaN(updatedAt.getTime())) {
    return "missing";
  }
  return now.getTime() - updatedAt.getTime() > staleAfterMs ? "stale" : "fresh";
}

export function freshnessLabel(freshness: Freshness): string {
  switch (freshness) {
    case "fresh":
      return "Fresh";
    case "stale":
      return "Delayed";
    case "missing":
      return "Updated time unavailable";
  }
}
