import { createHash } from "node:crypto";

const defaultMaxFailures = 5;
const defaultWindowMs = 15 * 60 * 1000;
const maxBuckets = 10_000;

export type LoginAttemptLimiter = {
  key(ip: string, email: string): string;
  isLimited(key: string): boolean;
  recordFailure(key: string): void;
  clear(key: string): void;
};

export function createLoginAttemptLimiter(
  options: { maxFailures?: number; windowMs?: number; now?: () => number } = {},
): LoginAttemptLimiter {
  const maxFailures = options.maxFailures ?? defaultMaxFailures;
  const windowMs = options.windowMs ?? defaultWindowMs;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  function current(key: string): { count: number; resetAt: number } {
    const found = buckets.get(key);
    const time = now();
    if (!found || found.resetAt <= time) {
      const fresh = { count: 0, resetAt: time + windowMs };
      buckets.set(key, fresh);
      return fresh;
    }
    return found;
  }

  return {
    key(ip, email) {
      const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
      return `${ip}\u0000${digest}`;
    },
    isLimited(key) {
      return current(key).count >= maxFailures;
    },
    recordFailure(key) {
      const bucket = current(key);
      bucket.count += 1;
      if (buckets.size > maxBuckets) {
        const time = now();
        for (const [storedKey, stored] of buckets) {
          if (stored.resetAt <= time) buckets.delete(storedKey);
        }
      }
    },
    clear(key) {
      buckets.delete(key);
    },
  };
}
