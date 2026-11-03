import { Redis } from "ioredis";
import type { CachePolicy } from "../config/cache-policy.ts";
import type { QuotaPolicy } from "../config/quota.ts";
import type { RedisConfig } from "../config/redis.ts";
import { createQuotaGate, type QuotaGate } from "../providers/quota.ts";
import type { Logger } from "../shared/logger.ts";
import { redactString } from "../shared/redact.ts";
import { createCacheService, type CacheService } from "./service.ts";
import { createRedisStore } from "./redis-store.ts";
import type { CacheStore, CounterStore } from "./store.ts";
import type { RedisCommandClient } from "./redis-store.ts";

export type CacheCheck = "not_configured" | "ok" | "unavailable";

export type CacheHandle = {
  check: () => Promise<CacheCheck>;
  service: CacheService;
  quota: QuotaGate;
  /** Shared by sync workers for distributed locks. Null when Redis is not configured. */
  store: CacheStore | null;
  /** Cache policy including the deployment key environment segment. */
  policy: CachePolicy;
  close: () => Promise<void>;
};

export function createUnconfiguredCache(policy: CachePolicy, quotaPolicy: QuotaPolicy, logger: Logger): CacheHandle {
  const quota = createQuotaGate({ policy: quotaPolicy, logger });
  return {
    async check() {
      return "not_configured";
    },
    service: createCacheService({
      store: null,
      policy,
      logger,
      originGate: (load) => quota.run(load),
    }),
    quota,
    store: null,
    policy,
    async close() {
      return undefined;
    },
  };
}

export async function connectCache(
  config: RedisConfig,
  policy: CachePolicy,
  quotaPolicy: QuotaPolicy,
  logger: Logger,
): Promise<CacheHandle> {
  const client = new Redis(config.url, redisClientOptions(config));
  client.on("error", (error: Error) => {
    logger.error("Redis client error", { detail: redactString(error.message) });
  });

  const close = async () => {
    try {
      await client.quit();
    } catch (error) {
      logger.error("Redis close failed", {
        detail: redactString(error instanceof Error ? error.message : "unknown"),
      });
    }
  };

  try {
    await client.connect();
    const reply = await client.ping();
    if (reply !== "PONG") throw new Error("Redis ping failed");
  } catch (error) {
    logger.error("Redis connection failed", {
      detail: redactString(error instanceof Error ? error.message : "unknown"),
    });
    return assemble(failingStore(), policy, quotaPolicy, logger, close);
  }

  return assemble(createRedisStore(asCommands(client)), policy, quotaPolicy, logger, close);
}

function assemble(
  store: CacheStore & CounterStore,
  policy: CachePolicy,
  quotaPolicy: QuotaPolicy,
  logger: Logger,
  close: () => Promise<void>,
): CacheHandle {
  const quota = createQuotaGate({ policy: quotaPolicy, counters: store, logger });
  return {
    async check() {
      try {
        return (await store.ping()) ? "ok" : "unavailable";
      } catch (error) {
        logger.error("Cache readiness failed", {
          detail: redactString(error instanceof Error ? error.message : "unknown"),
        });
        return "unavailable";
      }
    },
    service: createCacheService({
      store,
      policy,
      logger,
      originGate: (load) => quota.run(load),
    }),
    quota,
    store,
    policy,
    close,
  };
}

function failingStore(): CacheStore & CounterStore {
  const failure = () => Promise.reject(new Error("Redis unavailable"));
  return {
    get: failure,
    set: failure,
    deleteByPrefix: failure,
    setIfAbsent: failure,
    compareAndDelete: failure,
    increment: failure,
    read: failure,
    async ping() {
      return false;
    },
    async close() {
      return undefined;
    },
  };
}

/** Bounded reconnect. TLS follows the URL scheme and is never forced or unverified. */
export function redisClientOptions(config: RedisConfig) {
  return {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: config.connectTimeoutMs,
    enableOfflineQueue: false,
    retryStrategy(times: number) {
      if (times > 8) return null;
      return Math.min(times * 200, 2_000);
    },
  };
}

function asCommands(client: Redis): RedisCommandClient {
  return {
    get: (key) => client.get(key),
    set: (key, value, expiryMode, ttlMs, setMode) =>
      setMode
        ? client.set(key, value, expiryMode, ttlMs, setMode)
        : client.set(key, value, expiryMode, ttlMs),
    del: (...keys) => client.del(...keys),
    scan: (cursor, matchMode, pattern, countMode, count) => client.scan(cursor, matchMode, pattern, countMode, count),
    eval: (script, keyCount, ...args) => client.eval(script, keyCount, ...args),
    incr: (key) => client.incr(key),
    pexpire: (key, ttlMs) => client.pexpire(key, ttlMs),
    ping: () => client.ping(),
    quit: () => client.quit(),
  };
}
