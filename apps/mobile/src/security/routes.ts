import { stableIdSchema } from "@ipo-singh/contracts";

/**
 * Validates Expo Router deep-link / path params that name an IPO or article.
 * Rejects empty, oversized, or non-slug values before screens fetch.
 */
export function safeRouteSlug(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 120) return null;
  const parsed = stableIdSchema.safeParse(trimmed);
  return parsed.success ? parsed.data : null;
}
