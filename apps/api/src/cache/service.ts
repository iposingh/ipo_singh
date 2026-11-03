import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CachePolicy, CacheResource } from "../config/cache-policy.ts";
import type { Logger } from "../shared/logger.ts";
import { redactString } from "../shared/redact.ts";
import { CachePolicyError, CacheStormError } from "./errors.ts";
import { cacheKey, containsSensitiveField } from "./keys.ts";
import type { CacheNamespace } from "../config/cache-policy.ts";
import type { CacheStore } from "./store.ts";

const envelopeSchema = z
  .object({
    v: z.literal(1),
    storedAt: z.string().datetime(),
    freshUntil: z.string().datetime(),
    staleUntil: z.string().datetime(),
    value: z.unknown(),
  })
  .strict();

export type CacheFreshness = "fresh" | "stale" | "loaded";

export type CacheResult<T> = {
  value: T;
  freshness: CacheFreshness;
  source: "cache" | "origin";
  verification?: "verify-before-use";
  refresh?: Promise<void>;
};

export type CacheMetrics = {
  hits: number;
  misses: number;
  staleHits: number;
  originLoads: number;
  originFailures: number;
  storeErrors: number;
  stampedesAvoided: number;
};

export type CacheLoadOptions<T> = {
  namespace: CacheNamespace;
  resource: CacheResource;
  id: string;
  load: () => Promise<T>;
  parse: (value: unknown) => T;
  revalidate?: boolean;
  /** Shorter than the resource TTL when a schedule selects one. It cannot outlive the stale window. */
  freshMs?: number;
  /**
   * Public catalogue reads are not provider calls.
   * They skip the upstream quota and the provider miss-storm counter.
   */
  meter?: "provider" | "public";
};

type Stored<T> = {
  value: T;
  freshness: "fresh" | "stale";
};

type CacheServiceOptions = {
  store: CacheStore | null;
  policy: CachePolicy;
  logger: Logger;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  originGate?: <T>(load: () => Promise<T>) => Promise<T>;
};

export type CacheService = {
  getOrLoad: <T>(options: CacheLoadOptions<T>) => Promise<CacheResult<T>>;
  invalidate: (namespace: CacheNamespace, resource: CacheResource, id: string) => Promise<void>;
  invalidateAfterSync: (resource: CacheResource, id: string) => Promise<void>;
  /** Moves a fresh entry into the stale window so the next read refreshes without dropping the last value. */
  expireFreshness: (namespace: CacheNamespace, resource: CacheResource, id: string) => Promise<"expired" | "missing" | "unavailable">;
  metrics: () => CacheMetrics;
};

export function createCacheService(options: CacheServiceOptions): CacheService {
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const flights = new Map<string, Promise<CacheResult<unknown>>>();
  const misses: number[] = [];
  const metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    staleHits: 0,
    originLoads: 0,
    originFailures: 0,
    storeErrors: 0,
    stampedesAvoided: 0,
  };

  function verification(resource: CacheResource): "verify-before-use" | undefined {
    return resource === "registrars" ? "verify-before-use" : undefined;
  }

  async function readStore(key: string): Promise<string | null> {
    if (!options.store) return null;
    try {
      return await options.store.get(key);
    } catch (error) {
      metrics.storeErrors += 1;
      options.logger.error("Cache store failed", {
        detail: redactString(error instanceof Error ? error.message : "unknown"),
      });
      return null;
    }
  }

  async function read<T>(key: string, parse: (value: unknown) => T, at: Date): Promise<Stored<T> | null> {
    const raw = await readStore(key);
    if (!raw) return null;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }
    const envelope = envelopeSchema.safeParse(json);
    if (!envelope.success) return null;
    if (new Date(envelope.data.staleUntil).getTime() <= at.getTime()) return null;
    let value: T;
    try {
      value = parse(envelope.data.value);
    } catch {
      return null;
    }
    if (containsSensitiveField(value)) return null;
    const freshness = new Date(envelope.data.freshUntil).getTime() > at.getTime() ? "fresh" : "stale";
    return { value, freshness };
  }

  async function write<T>(key: string, value: T, resource: CacheResource, at: Date, freshMs?: number): Promise<void> {
    if (containsSensitiveField(value)) throw new CachePolicyError("sensitive-value");
    if (!options.store) return;
    const duration = options.policy.resources[resource];
    const fresh = freshMs ?? duration.freshMs;
    if (fresh < 1 || fresh > duration.staleMs) throw new CachePolicyError("ttl");
    const envelope = {
      v: 1 as const,
      storedAt: at.toISOString(),
      freshUntil: new Date(at.getTime() + fresh).toISOString(),
      staleUntil: new Date(at.getTime() + duration.staleMs).toISOString(),
      value,
    };
    try {
      await options.store.set(key, JSON.stringify(envelope), duration.staleMs);
    } catch (error) {
      metrics.storeErrors += 1;
      options.logger.error("Cache store failed", {
        detail: redactString(error instanceof Error ? error.message : "unknown"),
      });
    }
  }

  function storming(at: Date): boolean {
    const cutoff = at.getTime() - options.policy.missStormWindowMs;
    while (misses.length > 0 && (misses[0] ?? 0) < cutoff) misses.shift();
    return misses.length >= options.policy.missStormLimit;
  }

  async function loadThroughGate<T>(load: () => Promise<T>, meter: CacheLoadOptions<T>["meter"]): Promise<T> {
    if (meter === "public" || !options.originGate) return load();
    return options.originGate(load);
  }

  async function fill<T>(key: string, request: CacheLoadOptions<T>, at: Date): Promise<CacheResult<T>> {
    const token = randomUUID();
    const lockKey = `lock:${key}`;
    let locked = !options.store;
    let lockUnavailable = false;
    if (options.store) {
      try {
        locked = await options.store.setIfAbsent(lockKey, token, options.policy.lockMs);
      } catch (error) {
        lockUnavailable = true;
        metrics.storeErrors += 1;
        options.logger.error("Cache store failed", {
          detail: redactString(error instanceof Error ? error.message : "unknown"),
        });
      }
    }

    if (options.store && !locked && !lockUnavailable) {
      const waited = await waitForValue(key, request, at);
      if (waited) {
        metrics.stampedesAvoided += 1;
        return waited;
      }
      try {
        locked = await options.store.setIfAbsent(lockKey, token, options.policy.lockMs);
      } catch (error) {
        lockUnavailable = true;
        metrics.storeErrors += 1;
        options.logger.error("Cache store failed", {
          detail: redactString(error instanceof Error ? error.message : "unknown"),
        });
      }
    }

    try {
      if (options.store && !locked && !lockUnavailable) {
        metrics.stampedesAvoided += 1;
        throw new CacheStormError();
      }
      const value = await loadThroughGate(request.load, request.meter);
      metrics.originLoads += 1;
      await write(key, value, request.resource, now(), request.freshMs);
      return {
        value,
        freshness: "loaded",
        source: "origin",
        verification: verification(request.resource),
      };
    } catch (error) {
      if (!(error instanceof CacheStormError)) metrics.originFailures += 1;
      const fallback = await read(key, request.parse, now());
      if (fallback && !(error instanceof CachePolicyError)) {
        metrics.staleHits += 1;
        return {
          value: fallback.value,
          freshness: "stale",
          source: "cache",
          verification: verification(request.resource),
        };
      }
      throw error;
    } finally {
      if (locked && options.store) {
        try {
          await options.store.compareAndDelete(lockKey, token);
        } catch (error) {
          metrics.storeErrors += 1;
          options.logger.error("Cache store failed", {
            detail: redactString(error instanceof Error ? error.message : "unknown"),
          });
        }
      }
    }
  }

  async function waitForValue<T>(key: string, request: CacheLoadOptions<T>, at: Date): Promise<CacheResult<T> | null> {
    const polls = Math.max(1, Math.ceil(options.policy.waitMs / 20));
    for (let attempt = 0; attempt < polls; attempt += 1) {
      await sleep(20);
      const found = await read(key, request.parse, at);
      if (!found) continue;
      return {
        value: found.value,
        freshness: found.freshness,
        source: "cache",
        verification: verification(request.resource),
      };
    }
    return null;
  }

  function singleFlight<T>(key: string, run: () => Promise<CacheResult<T>>): Promise<CacheResult<T>> {
    const existing = flights.get(key);
    if (existing) return existing as Promise<CacheResult<T>>;
    const pending = run().finally(() => {
      flights.delete(key);
    });
    flights.set(key, pending as Promise<CacheResult<unknown>>);
    return pending;
  }

  return {
    async getOrLoad<T>(request: CacheLoadOptions<T>): Promise<CacheResult<T>> {
      const key = cacheKey({
        version: options.policy.version,
        environment: options.policy.environment,
        namespace: request.namespace,
        resource: request.resource,
        id: request.id,
      });
      const at = now();
      const cached = await read(key, request.parse, at);
      if (cached?.freshness === "fresh") {
        metrics.hits += 1;
        return {
          value: cached.value,
          freshness: "fresh",
          source: "cache",
          verification: verification(request.resource),
        };
      }
      if (cached?.freshness === "stale") {
        metrics.staleHits += 1;
        if (request.revalidate === false) {
          return {
            value: cached.value,
            freshness: "stale",
            source: "cache",
            verification: verification(request.resource),
          };
        }
        const refresh = singleFlight(key, () => fill(key, request, at)).then(() => undefined);
        return {
          value: cached.value,
          freshness: "stale",
          source: "cache",
          verification: verification(request.resource),
          refresh,
        };
      }

      metrics.misses += 1;
      if (request.meter !== "public") {
        if (storming(at)) throw new CacheStormError();
        misses.push(at.getTime());
      }
      return singleFlight(key, () => fill(key, request, at));
    },

    async invalidate(namespace, resource, id) {
      const key = cacheKey({ version: options.policy.version, environment: options.policy.environment, namespace, resource, id });
      if (!options.store) return;
      try {
        await options.store.deleteByPrefix(key);
      } catch (error) {
        metrics.storeErrors += 1;
        options.logger.error("Cache store failed", {
          detail: redactString(error instanceof Error ? error.message : "unknown"),
        });
      }
    },

    async invalidateAfterSync(resource, id) {
      await this.invalidate("provider", resource, id);
      await this.invalidate("public", resource, id);
    },

    async expireFreshness(namespace, resource, id) {
      if (!options.store) return "unavailable";
      const key = cacheKey({ version: options.policy.version, environment: options.policy.environment, namespace, resource, id });
      const raw = await readStore(key);
      if (!raw) return "missing";
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return "missing";
      }
      const envelope = envelopeSchema.safeParse(json);
      if (!envelope.success) return "missing";
      const at = now();
      const staleUntil = new Date(envelope.data.staleUntil).getTime();
      if (staleUntil <= at.getTime()) return "missing";
      if (new Date(envelope.data.freshUntil).getTime() <= at.getTime()) return "expired";
      const ttl = staleUntil - at.getTime();
      try {
        await options.store.set(
          key,
          JSON.stringify({ ...envelope.data, freshUntil: at.toISOString() }),
          ttl,
        );
      } catch (error) {
        metrics.storeErrors += 1;
        options.logger.error("Cache store failed", {
          detail: redactString(error instanceof Error ? error.message : "unknown"),
        });
        return "unavailable";
      }
      return "expired";
    },

    metrics() {
      return { ...metrics };
    },
  };
}
