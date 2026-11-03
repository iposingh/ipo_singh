import type { CacheStore, CounterStore } from "./store.ts";

type Expiring = {
  value: string;
  expiresAt: number;
};

export function createMemoryStore(now: () => number = Date.now): CacheStore & CounterStore {
  const values = new Map<string, Expiring>();
  const locks = new Map<string, Expiring>();
  const counts = new Map<string, Expiring>();

  function read(map: Map<string, Expiring>, key: string): string | null {
    const row = map.get(key);
    if (!row) return null;
    if (row.expiresAt <= now()) {
      map.delete(key);
      return null;
    }
    return row.value;
  }

  return {
    async get(key) {
      return read(values, key);
    },
    async set(key, value, ttlMs) {
      values.set(key, { value, expiresAt: now() + ttlMs });
    },
    async deleteByPrefix(prefix) {
      for (const key of values.keys()) {
        if (key.startsWith(prefix)) values.delete(key);
      }
    },
    async setIfAbsent(key, value, ttlMs) {
      if (read(locks, key) !== null) return false;
      locks.set(key, { value, expiresAt: now() + ttlMs });
      return true;
    },
    async compareAndDelete(key, value) {
      if (read(locks, key) !== value) return false;
      locks.delete(key);
      return true;
    },
    async increment(key, ttlMs) {
      const current = Number(read(counts, key) ?? "0");
      const next = current + 1;
      counts.set(key, { value: String(next), expiresAt: now() + ttlMs });
      return next;
    },
    async read(key) {
      const current = read(counts, key);
      if (current === null) return 0;
      const parsed = Number(current);
      return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
    },
    async ping() {
      return true;
    },
    async close() {
      values.clear();
      locks.clear();
      counts.clear();
    },
  };
}
