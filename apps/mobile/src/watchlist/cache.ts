import { watchlistItemSchema, type WatchlistItem } from "@ipo-singh/contracts";
import { z } from "zod";
import { clearDevicePreference, readDevicePreference, writeDevicePreference } from "../theme/preference-storage.ts";
import { dedupeWatchlist } from "./list.ts";

/** Guest devices do not keep a local watchlist. Saved IPOs require a signed-in account. */
export const guestWatchlistSupported = false;

export const watchlistCacheKeyPrefix = "ipo-singh.watchlist.";

const cacheSchema = z.object({
  userId: z.string().min(1),
  items: z.array(watchlistItemSchema).max(200),
  savedAt: z.string().datetime(),
}).strict();

export function watchlistCacheKey(userId: string): string {
  return `${watchlistCacheKeyPrefix}${userId}`;
}

export async function readWatchlistCache(userId: string): Promise<WatchlistItem[] | null> {
  const raw = await readDevicePreference(watchlistCacheKey(userId));
  if (!raw) return null;
  try {
    const parsed = cacheSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.userId !== userId) return null;
    return dedupeWatchlist(parsed.data.items);
  } catch {
    return null;
  }
}

export async function writeWatchlistCache(userId: string, items: readonly WatchlistItem[], now = new Date()): Promise<void> {
  const body = cacheSchema.parse({
    userId,
    items: dedupeWatchlist(items),
    savedAt: now.toISOString(),
  });
  await writeDevicePreference(watchlistCacheKey(userId), JSON.stringify(body));
}

export async function clearWatchlistCache(userId: string): Promise<void> {
  await clearDevicePreference(watchlistCacheKey(userId));
}
