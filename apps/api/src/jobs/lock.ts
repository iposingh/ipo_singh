import { randomUUID } from "node:crypto";
import type { CacheStore } from "../cache/store.ts";

export type SyncLock = {
  /** Returns a release function, or null when this job is already running here or on another instance. */
  acquire(name: string, ttlMs: number): Promise<(() => Promise<void>) | null>;
};

export type SyncLockOptions = {
  /**
   * Single-process coordination only. Never enable across multiple hosts.
   * When the shared store is missing and this flag is false, acquire always fails closed.
   */
  allowProcessLocal?: boolean;
  /** Isolates lock keys across deployment lanes on a shared Redis instance. */
  environment?: string;
};

/**
 * Distributed sync lock backed by Redis (or another CacheStore with setIfAbsent).
 * Redis errors and a missing store fail closed — they do not grant a multi-host lock.
 */
export function createSyncLock(
  store: Pick<CacheStore, "setIfAbsent" | "compareAndDelete"> | null,
  options: SyncLockOptions = {},
): SyncLock {
  const allowProcessLocal = options.allowProcessLocal === true;
  const environment = options.environment?.trim() || "dev";
  const local = new Set<string>();

  return {
    async acquire(name, ttlMs) {
      if (local.has(name)) return null;

      if (!store) {
        if (!allowProcessLocal) return null;
        local.add(name);
        return async () => {
          local.delete(name);
        };
      }

      local.add(name);
      const token = randomUUID();
      const key = `ipo-singh:${environment}:sync-lock:${name}`;
      try {
        const acquired = await store.setIfAbsent(key, token, ttlMs);
        if (!acquired) {
          local.delete(name);
          return null;
        }
      } catch {
        // Redis unavailable: refuse the job rather than running without a shared lock.
        local.delete(name);
        return null;
      }
      return async () => {
        local.delete(name);
        try {
          await store.compareAndDelete(key, token);
        } catch {
          local.delete(name);
        }
      };
    },
  };
}
