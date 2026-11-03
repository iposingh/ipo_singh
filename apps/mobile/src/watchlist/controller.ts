import { watchlistItemSchema, watchlistResponseSchema, type IpoSummary, type WatchlistItem } from "@ipo-singh/contracts";
import { z } from "zod";
import type { AuthResult, AuthSession } from "../auth/session.ts";
import { addWatchItem, provisionalWatchItem, removeWatchItem, watchlistCollectionPath, watchlistItemPath, dedupeWatchlist } from "./list.ts";

export type AccountCaller = AuthSession["authorized"];

const emptySchema = z.null();

export type WatchlistController = {
  items(): WatchlistItem[];
  load(): Promise<AuthResult<{ items: WatchlistItem[] }>>;
  toggle(ipo: IpoSummary, now: Date): Promise<AuthResult<WatchlistItem | null>>;
  remove(ipoId: string): Promise<AuthResult<null>>;
};

export function createWatchlistController(call: AccountCaller): WatchlistController {
  let items: WatchlistItem[] = [];
  let chain = Promise.resolve();

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = chain.then(work, work);
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  function settle(result: AuthResult<unknown>, previous: WatchlistItem[]): void {
    if (result.status === "signed-out") items = [];
    else if (result.status !== "ready") items = previous;
  }

  return {
    items: () => items,
    load() {
      return enqueue(async () => {
        const result = await call({ path: watchlistCollectionPath, schema: watchlistResponseSchema });
        if (result.status === "ready") items = dedupeWatchlist(result.value.items);
        if (result.status === "signed-out") items = [];
        return result;
      });
    },
    toggle(ipo, now) {
      return enqueue(async () => {
        const provisional = provisionalWatchItem(ipo, now);
        if (!provisional) return { status: "rejected", message: "That IPO cannot be saved." };
        const previous = items;
        const saved = items.some((item) => item.ipoId === provisional.ipoId);
        items = saved ? removeWatchItem(items, provisional.ipoId) : addWatchItem(items, provisional);
        const path = saved ? watchlistItemPath(provisional.ipoId) : watchlistCollectionPath;
        if (!path) {
          items = previous;
          return { status: "rejected", message: "That IPO cannot be saved." };
        }
        if (saved) {
          const removed = await call({ path, schema: emptySchema, method: "DELETE" });
          if (removed.status !== "ready") settle(removed, previous);
          return removed;
        }
        const savedItem = await call({ path, schema: watchlistItemSchema, method: "POST", body: { ipoId: provisional.ipoId } });
        if (savedItem.status !== "ready") {
          settle(savedItem, previous);
          return savedItem;
        }
        items = addWatchItem(removeWatchItem(items, provisional.ipoId), savedItem.value);
        return savedItem;
      });
    },
    remove(ipoId) {
      return enqueue(async () => {
        const path = watchlistItemPath(ipoId);
        if (!path) return { status: "rejected", message: "That IPO cannot be removed." };
        const previous = items;
        items = removeWatchItem(items, ipoId);
        const result = await call({ path, schema: emptySchema, method: "DELETE" });
        if (result.status !== "ready") settle(result, previous);
        return result;
      });
    },
  };
}
