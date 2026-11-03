import type { QuotaPolicy } from "../config/quota.ts";
import type { Logger } from "../shared/logger.ts";
import { redactString } from "../shared/redact.ts";
import type { CounterStore } from "../cache/store.ts";
import { createMemoryStore } from "../cache/memory-store.ts";

export class QuotaExhaustedError extends Error {
  readonly window: "minute" | "day";

  constructor(window: "minute" | "day") {
    super(window === "minute" ? "Provider minute quota is exhausted." : "Provider day quota is exhausted.");
    this.name = "QuotaExhaustedError";
    this.window = window;
  }
}

export class ProviderOutageError extends Error {
  constructor() {
    super("Provider calls are paused after repeated failures.");
    this.name = "ProviderOutageError";
  }
}

export type QuotaPriority = "normal" | "reserved";

export type QuotaSnapshot = {
  minuteUsed: number | null;
  dayUsed: number | null;
};

export type QuotaRunOptions = {
  priority?: QuotaPriority;
  /** Defaults to retrying. Return false for 402, validation, and other terminal responses. */
  retryable?: (error: unknown) => boolean;
  /** Defaults to counting the failure toward the circuit breaker. */
  outage?: (error: unknown) => boolean;
  /** Wait before the next attempt. Absent values use the configured backoff. */
  delayMs?: (error: unknown, attempt: number) => number;
};

export type QuotaGate = {
  run: <T>(load: () => Promise<T>, options?: QuotaRunOptions) => Promise<T>;
  snapshot: () => Promise<QuotaSnapshot>;
};

type QuotaGateOptions = {
  policy: QuotaPolicy;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  counters?: CounterStore;
  logger?: Logger;
  /** Separates one caller's counters from another gate sharing the same store. */
  keyPrefix?: string;
};

export function backoffDelayMs(attempt: number, baseMs: number, maxMs: number, random: () => number): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(exponential + exponential * 0.2 * random());
}

export function createQuotaGate(options: QuotaGateOptions): QuotaGate {
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const local = createMemoryStore(() => now().getTime());
  const prefix = options.keyPrefix ?? "";
  let consecutiveFailures = 0;
  let openUntil = 0;
  let trialInFlight = false;

  function minuteKey(at: Date): string {
    return `${prefix}minute:${Math.floor(at.getTime() / 60_000)}`;
  }

  function dayKey(at: Date): string {
    return `${prefix}day:${at.toISOString().slice(0, 10)}`;
  }

  function circuitOpen(at: number): boolean {
    if (openUntil > at) return true;
    if (openUntil !== 0) {
      if (trialInFlight) return true;
      trialInFlight = true;
    }
    return false;
  }

  async function take(priority: QuotaPriority, at: Date): Promise<void> {
    const minute = await increment(minuteKey(at), 60_000);
    const day = await increment(dayKey(at), 24 * 60 * 60 * 1000);
    if (minute > options.policy.requestsPerMinute) throw new QuotaExhaustedError("minute");
    const dayLimit =
      priority === "reserved"
        ? options.policy.requestsPerDay
        : options.policy.requestsPerDay - options.policy.reservedRequests;
    if (day > dayLimit) throw new QuotaExhaustedError("day");
  }

  async function readCount(key: string): Promise<number | null> {
    try {
      if (!options.counters) return local.read(key);
      return await options.counters.read(key);
    } catch (error) {
      if (error instanceof QuotaExhaustedError) throw error;
      options.logger?.error("Quota counter unavailable", {
        detail: redactString(error instanceof Error ? error.message : "unknown"),
      });
      return null;
    }
  }

  async function increment(key: string, ttlMs: number): Promise<number> {
    if (!options.counters) return local.increment(key, ttlMs);
    try {
      return await options.counters.increment(key, ttlMs);
    } catch (error) {
      if (error instanceof QuotaExhaustedError) throw error;
      options.logger?.error("Quota counter unavailable", {
        detail: redactString(error instanceof Error ? error.message : "unknown"),
      });
      return local.increment(key, ttlMs);
    }
  }

  return {
    async snapshot() {
      const at = now();
      return {
        minuteUsed: await readCount(minuteKey(at)),
        dayUsed: await readCount(dayKey(at)),
      };
    },
    async run<T>(load: () => Promise<T>, request?: QuotaRunOptions): Promise<T> {
      const priority = request?.priority ?? "normal";
      const attempts = options.policy.maxRetries + 1;
      let lastError: unknown;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const at = now();
        if (circuitOpen(at.getTime())) throw new ProviderOutageError();
        if (attempt > 0) {
          const custom = request?.delayMs?.(lastError, attempt - 1);
          const wait =
            typeof custom === "number" && Number.isFinite(custom)
              ? Math.max(0, Math.min(60_000, custom))
              : backoffDelayMs(attempt - 1, options.policy.backoffBaseMs, options.policy.backoffMaxMs, random);
          await sleep(wait);
        }
        await take(priority, now());
        try {
          const value = await load();
          consecutiveFailures = 0;
          openUntil = 0;
          trialInFlight = false;
          return value;
        } catch (error) {
          lastError = error;
          trialInFlight = false;
          const retryable = request?.retryable?.(error) ?? true;
          const outage = request?.outage?.(error) ?? true;
          if (!outage) {
            if (!retryable) break;
            continue;
          }
          if (consecutiveFailures + 1 >= options.policy.circuitFailures || openUntil !== 0) {
            consecutiveFailures = options.policy.circuitFailures;
            openUntil = now().getTime() + options.policy.circuitOpenMs;
            break;
          }
          consecutiveFailures += 1;
          if (!retryable) break;
        }
      }
      if (lastError instanceof Error) throw lastError;
      throw new ProviderOutageError();
    },
  };
}
