import type { z } from "zod";

/** Offline/fallback window shared across catalogue resources. */
export const catalogueStaleMs = 7 * 24 * 60 * 60 * 1000;

/**
 * Client fresh windows. Shorter than backend TTLs so pull-to-refresh stays useful,
 * while still avoiding duplicate network work during normal navigation.
 */
export const cachePolicies = {
  listings: { freshMs: 5 * 60 * 1000, staleMs: catalogueStaleMs },
  issue: { freshMs: 3 * 60 * 1000, staleMs: catalogueStaleMs },
  history: { freshMs: 15 * 60 * 1000, staleMs: catalogueStaleMs },
  promotions: { freshMs: 10 * 60 * 1000, staleMs: catalogueStaleMs },
  articles: { freshMs: 10 * 60 * 1000, staleMs: catalogueStaleMs },
} as const;

export type CachePolicyName = keyof typeof cachePolicies;
export type CachePolicy = { freshMs: number; staleMs: number };

/** @deprecated Prefer cachePolicies.listings.freshMs — kept for existing imports. */
export const catalogueFreshMs = cachePolicies.listings.freshMs;

export const cacheReadNote = "The saved list could not be read.";
export const cacheWriteNote = "The list could not be saved on this device.";
export const offlineCacheNote =
  "This device is offline. Showing the last saved list. GMP, subscription, and allotment figures may not be current.";
export const fallbackCacheNote =
  "The list could not be refreshed. Showing the last saved list. Figures may not be current.";

export type JsonCache = {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export function memoryJsonCache(): JsonCache {
  const values = new Map<string, string>();
  return {
    read(key) {
      return Promise.resolve(values.get(key) ?? null);
    },
    write(key, value) {
      values.set(key, value);
      return Promise.resolve();
    },
    remove(key) {
      values.delete(key);
      return Promise.resolve();
    },
  };
}

export function listCacheKey(origin: string, path: string): string {
  return `ipo-singh.catalogue.list.${encodeURIComponent(`${origin}${path}`)}`;
}

export function issueCacheKey(origin: string, slug: string): string {
  return `ipo-singh.catalogue.issue.${encodeURIComponent(origin)}.${slug}`;
}

export function historyCacheKey(kind: "gmp" | "subscription", origin: string, slug: string): string {
  return `ipo-singh.catalogue.${kind}-history.${encodeURIComponent(origin)}.${slug}`;
}

type CacheHit<T> = { hit: "fresh" | "stale"; value: T; storedAt: number; failed: false };
type CacheMiss = { hit: "miss"; failed: boolean };

export async function readCached<T>(
  store: JsonCache,
  key: string,
  schema: z.ZodType<T>,
  now: Date,
  allowStale: boolean,
  policy: CachePolicy = cachePolicies.listings,
): Promise<CacheHit<T> | CacheMiss> {
  let raw: string | null;
  try {
    raw = await store.read(key);
  } catch {
    return { hit: "miss", failed: true };
  }
  if (!raw) return { hit: "miss", failed: false };
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw) as unknown;
  } catch {
    return { hit: "miss", failed: true };
  }
  if (!parsedJson || typeof parsedJson !== "object") return { hit: "miss", failed: true };
  const storedAtText = "storedAt" in parsedJson ? parsedJson.storedAt : null;
  const body = "body" in parsedJson ? parsedJson.body : undefined;
  if (typeof storedAtText !== "string") return { hit: "miss", failed: true };
  const storedAt = new Date(storedAtText);
  if (Number.isNaN(storedAt.getTime())) return { hit: "miss", failed: true };
  const value = schema.safeParse(body);
  if (!value.success) return { hit: "miss", failed: true };
  const age = now.getTime() - storedAt.getTime();
  if (age <= policy.freshMs) return { hit: "fresh", value: value.data, storedAt: storedAt.getTime(), failed: false };
  if (allowStale && age <= policy.staleMs) return { hit: "stale", value: value.data, storedAt: storedAt.getTime(), failed: false };
  return { hit: "miss", failed: false };
}

export async function writeCached(store: JsonCache, key: string, body: unknown, now: Date): Promise<"saved" | "failed"> {
  try {
    await store.write(key, JSON.stringify({ storedAt: now.toISOString(), body }));
    return "saved";
  } catch {
    return "failed";
  }
}

/** Drop a device-cache entry so the next load refetches (pull-to-refresh / force). */
export async function invalidateCached(store: JsonCache, key: string): Promise<void> {
  try {
    await store.remove(key);
  } catch {
    return;
  }
}
