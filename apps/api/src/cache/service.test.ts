import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultCachePolicy, type CachePolicy } from "../config/cache-policy.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import { invalidateAfterSuccessfulSync } from "../jobs/index.ts";
import { createQuotaGate, QuotaExhaustedError } from "../providers/quota.ts";
import { createLogger } from "../shared/logger.ts";
import { CachePolicyError, CacheStormError } from "./errors.ts";
import { cacheKey } from "./keys.ts";
import { createMemoryStore } from "./memory-store.ts";
import { createCacheService, type CacheService } from "./service.ts";
import type { CacheStore } from "./store.ts";

const fixture = { label: "fixture" };

function parseFixture(value: unknown): { label: string } {
  if (!value || typeof value !== "object" || !("label" in value) || typeof value.label !== "string") {
    throw new Error("invalid fixture");
  }
  return { label: value.label };
}

function policy(partial: Partial<CachePolicy> = {}): CachePolicy {
  const base = defaultCachePolicy();
  return {
    ...base,
    ...partial,
    resources: {
      ...base.resources,
      gmp: { freshMs: 1_000, staleMs: 5_000 },
      ...partial.resources,
    },
  };
}

function logger(lines: string[] = []) {
  return createLogger({ level: "error", service: "test", sink: (line) => lines.push(line) });
}

function service(options: {
  now: () => number;
  store?: CacheStore | null;
  policy?: CachePolicy;
  lines?: string[];
  sleep?: (ms: number) => Promise<void>;
  originGate?: <T>(load: () => Promise<T>) => Promise<T>;
}): CacheService {
  return createCacheService({
    store: options.store === undefined ? createMemoryStore(options.now) : options.store,
    policy: options.policy ?? policy(),
    logger: logger(options.lines),
    now: () => new Date(options.now()),
    sleep: options.sleep ?? (async () => undefined),
    originGate: options.originGate,
  });
}

describe("cache service", () => {
  it("records a miss, then a fresh hit, then a stale read, then expiry", async () => {
    let now = Date.parse("2026-10-18T04:00:00.000Z");
    const store = createMemoryStore(() => now);
    const cache = service({ now: () => now, store });
    let loads = 0;
    const load = async () => {
      loads += 1;
      return fixture;
    };
    const request = {
      namespace: "provider" as const,
      resource: "gmp" as const,
      id: "issue-1",
      load,
      parse: parseFixture,
    };

    const missed = await cache.getOrLoad(request);
    assert.equal(missed.freshness, "loaded");
    assert.equal(missed.source, "origin");
    assert.equal(loads, 1);

    now += 500;
    const hit = await cache.getOrLoad(request);
    assert.equal(hit.freshness, "fresh");
    assert.equal(hit.source, "cache");
    assert.equal(loads, 1);

    now += 500;
    const stale = await cache.getOrLoad({ ...request, revalidate: false });
    assert.equal(stale.freshness, "stale");
    assert.equal(stale.value.label, "fixture");
    assert.equal(loads, 1);

    now += 4_000;
    const expired = await cache.getOrLoad(request);
    assert.equal(expired.freshness, "loaded");
    assert.equal(loads, 2);
    assert.deepEqual(cache.metrics(), {
      hits: 1,
      misses: 2,
      staleHits: 1,
      originLoads: 2,
      originFailures: 0,
      storeErrors: 0,
      stampedesAvoided: 0,
    });
  });

  it("shares one origin load across concurrent callers", async () => {
    const now = Date.parse("2026-10-18T04:00:00.000Z");
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let loads = 0;
    const cache = service({ now: () => now });
    let entered: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const load = async () => {
      loads += 1;
      entered();
      await hold;
      return fixture;
    };
    const request = {
      namespace: "public" as const,
      resource: "listings" as const,
      id: "board",
      load,
      parse: parseFixture,
    };
    const pending = Promise.all([cache.getOrLoad(request), cache.getOrLoad(request)]);
    await started;
    assert.equal(loads, 1);
    release();
    const [first, second] = await pending;
    assert.equal(first.value.label, "fixture");
    assert.equal(second.value.label, "fixture");
    assert.equal(loads, 1);
    assert.equal(cache.metrics().originLoads, 1);
  });

  it("lets a second instance wait for the lock holder instead of calling origin", async () => {
    const now = Date.parse("2026-10-18T04:00:00.000Z");
    const store = createMemoryStore(() => now);
    const lines: string[] = [];
    let releaseSleep: () => void = () => undefined;
    let markSleeping: () => void = () => undefined;
    const sleeping = new Promise<void>((resolve) => {
      markSleeping = resolve;
    });
    const shared = {
      now: () => now,
      store,
      policy: policy({ waitMs: 20 }),
      lines,
      sleep: () =>
        new Promise<void>((resolve) => {
          markSleeping();
          releaseSleep = resolve;
        }),
    };
    const holder = service(shared);
    const waiter = service(shared);
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let loads = 0;
    let entered: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = holder.getOrLoad({
      namespace: "provider",
      resource: "gmp",
      id: "issue-2",
      parse: parseFixture,
      load: async () => {
        loads += 1;
        entered();
        await hold;
        return fixture;
      },
    });
    await started;
    const second = waiter.getOrLoad({
      namespace: "provider",
      resource: "gmp",
      id: "issue-2",
      parse: parseFixture,
      load: async () => {
        loads += 1;
        return { label: "duplicate" };
      },
    });
    await sleeping;
    release();
    await first;
    releaseSleep();
    const [held, waited] = await Promise.all([first, second]);
    assert.equal(held.source, "origin");
    assert.equal(waited.source, "cache");
    assert.equal(waited.value.label, "fixture");
    assert.equal(loads, 1);
    assert.equal(waiter.metrics().stampedesAvoided, 1);
  });

  it("returns the last known value labeled stale when the origin fails", async () => {
    let now = Date.parse("2026-10-18T04:00:00.000Z");
    const cache = service({ now: () => now });
    const request = {
      namespace: "provider" as const,
      resource: "gmp" as const,
      id: "issue-3",
      parse: parseFixture,
    };
    await cache.getOrLoad({ ...request, load: async () => fixture });
    now += 1_000;
    const stale = await cache.getOrLoad({
      ...request,
      load: async () => {
        throw new Error("provider timeout");
      },
    });
    assert.equal(stale.freshness, "stale");
    assert.equal(stale.value.label, "fixture");
    await stale.refresh;
    assert.equal(cache.metrics().originFailures, 1);
    const kept = await cache.getOrLoad({ ...request, revalidate: false, load: async () => fixture });
    assert.equal(kept.freshness, "stale");
    assert.equal(kept.value.label, "fixture");
  });

  it("refreshes a stale value once for two callers", async () => {
    let now = Date.parse("2026-10-18T04:00:00.000Z");
    const cache = service({ now: () => now });
    const request = {
      namespace: "provider" as const,
      resource: "gmp" as const,
      id: "issue-4",
      parse: parseFixture,
    };
    await cache.getOrLoad({ ...request, load: async () => fixture });
    now += 1_000;
    let loads = 0;
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = async () => {
      loads += 1;
      await hold;
      return { label: "refreshed" };
    };
    const first = await cache.getOrLoad({ ...request, load });
    const second = await cache.getOrLoad({ ...request, load });
    release();
    assert.equal(first.freshness, "stale");
    assert.equal(second.freshness, "stale");
    await Promise.all([first.refresh, second.refresh]);
    assert.equal(loads, 1);
    const current = await cache.getOrLoad({ ...request, revalidate: false, load });
    assert.equal(current.freshness, "fresh");
    assert.equal(current.value.label, "refreshed");
  });

  it("stops a cache-miss storm before another origin call", async () => {
    const now = Date.parse("2026-10-18T04:00:00.000Z");
    const cache = service({ now: () => now, policy: policy({ missStormLimit: 2, missStormWindowMs: 10_000 }) });
    let loads = 0;
    const load = async () => {
      loads += 1;
      return fixture;
    };
    await cache.getOrLoad({ namespace: "provider", resource: "gmp", id: "a1", load, parse: parseFixture });
    await cache.getOrLoad({ namespace: "provider", resource: "gmp", id: "a2", load, parse: parseFixture });
    await assert.rejects(
      () => cache.getOrLoad({ namespace: "provider", resource: "gmp", id: "a3", load, parse: parseFixture }),
      CacheStormError,
    );
    assert.equal(loads, 2);
  });

  it("refuses sensitive keys and values and does not store them", async () => {
    const now = Date.parse("2026-10-18T04:00:00.000Z");
    const store = createMemoryStore(() => now);
    const cache = service({ now: () => now, store });
    await assert.rejects(
      () =>
        cache.getOrLoad({
          namespace: "public",
          resource: "issue",
          id: "user-1",
          load: async () => fixture,
          parse: parseFixture,
        }),
      (error: unknown) => error instanceof CachePolicyError && error.reason === "sensitive-key",
    );
    await assert.rejects(
      () =>
        cache.getOrLoad({
          namespace: "public",
          resource: "issue",
          id: "issue-5",
          load: async () => ({ pan: "ABCDE1234F" }),
          parse: (value) => value,
        }),
      (error: unknown) => error instanceof CachePolicyError && error.reason === "sensitive-value",
    );
    assert.equal(await store.get(cacheKey({ version: 1, namespace: "public", resource: "issue", id: "issue-5" })), null);
  });

  it("keeps provider and public entries separate and drops both after a successful sync", async () => {
    const now = Date.parse("2026-10-18T04:00:00.000Z");
    const store = createMemoryStore(() => now);
    const cache = service({ now: () => now, store, policy: policy({ version: 2 }) });
    await cache.getOrLoad({
      namespace: "provider",
      resource: "listings",
      id: "mainboard",
      load: async () => fixture,
      parse: parseFixture,
    });
    await cache.getOrLoad({
      namespace: "public",
      resource: "listings",
      id: "mainboard",
      load: async () => ({ label: "public" }),
      parse: parseFixture,
    });
    const providerKey = cacheKey({ version: 2, namespace: "provider", resource: "listings", id: "mainboard" });
    const publicKey = cacheKey({ version: 2, namespace: "public", resource: "listings", id: "mainboard" });
    assert.match(providerKey, /^ipo-singh:dev:v2:provider:listings:mainboard$/);
    assert.notEqual(await store.get(providerKey), null);
    assert.notEqual(await store.get(publicKey), null);
    await invalidateAfterSuccessfulSync(cache, "listings", "mainboard");
    assert.equal(await store.get(providerKey), null);
    assert.equal(await store.get(publicKey), null);
  });

  it("labels registrar cache entries for verification", async () => {
    const now = Date.parse("2026-10-18T04:00:00.000Z");
    const cache = service({ now: () => now });
    const loaded = await cache.getOrLoad({
      namespace: "provider",
      resource: "registrars",
      id: "registrar-1",
      load: async () => fixture,
      parse: parseFixture,
    });
    assert.equal(loaded.verification, "verify-before-use");
  });

  it("loads from origin and logs a redacted error when Redis commands fail", async () => {
    const now = Date.parse("2026-10-18T04:00:00.000Z");
    const lines: string[] = [];
    const failure = new Error("connect ECONNREFUSED redis://:super-secret-value@127.0.0.1:6379/0");
    const cache = service({
      now: () => now,
      lines,
      store: {
        async get() {
          throw failure;
        },
        async set() {
          throw failure;
        },
        async deleteByPrefix() {
          throw failure;
        },
        async setIfAbsent() {
          throw failure;
        },
        async compareAndDelete() {
          throw failure;
        },
        async ping() {
          return false;
        },
        async close() {
          return undefined;
        },
      },
    });
    const result = await cache.getOrLoad({
      namespace: "provider",
      resource: "history",
      id: "issue-6",
      load: async () => fixture,
      parse: parseFixture,
    });
    assert.equal(result.freshness, "loaded");
    assert.equal(result.value.label, "fixture");
    assert.ok(cache.metrics().storeErrors > 0);
    const logged = lines.join("\n");
    assert.match(logged, /Cache store failed/);
    assert.equal(logged.includes("super-secret-value"), false);
  });

  it("does not spend quota on a fresh hit", async () => {
    const now = Date.parse("2026-10-18T04:00:00.000Z");
    const store = createMemoryStore(() => now);
    let quotaCalls = 0;
    const quota = createQuotaGate({
      policy: { ...defaultQuotaPolicy(), requestsPerMinute: 1, requestsPerDay: 5, reservedRequests: 1 },
      now: () => new Date(now),
      random: () => 0,
      counters: store,
    });
    const cache = service({
      now: () => now,
      store,
      originGate: (load) => {
        quotaCalls += 1;
        return quota.run(load);
      },
    });
    const request = {
      namespace: "provider" as const,
      resource: "gmp" as const,
      id: "issue-7",
      load: async () => fixture,
      parse: parseFixture,
    };
    await cache.getOrLoad(request);
    await cache.getOrLoad(request);
    assert.equal(quotaCalls, 1);
    await assert.rejects(
      () =>
        cache.getOrLoad({
          ...request,
          id: "issue-8",
          load: async () => fixture,
        }),
      QuotaExhaustedError,
    );
  });
});
