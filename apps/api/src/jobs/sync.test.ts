import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IpoStatus } from "@ipo-singh/contracts";
import { createMemoryStore } from "../cache/memory-store.ts";
import { createCacheService } from "../cache/service.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import { ConfigError } from "../shared/errors.ts";
import { defaultSyncPolicy, readSyncPolicy } from "../config/sync-policy.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import type {
  CompanyRecord,
  FinancialStatementRecord,
  GmpObservationRecord,
  IpoRecord,
  RegistrarRecord,
  SourceDocumentRecord,
  SourceMetadataRecord,
  SubscriptionObservationRecord,
  SyncRunRecord,
} from "../db/records.ts";
import { jobsStatus } from "../jobs/index.ts";
import { createSyncLock } from "../jobs/lock.ts";
import { planIssueSync } from "../jobs/schedule.ts";
import { assertManualSyncAllowed, ManualSyncError, runManualSync, runSyncTick, type SyncContext } from "../jobs/sync-service.ts";
import { createSyncWorker } from "../jobs/worker.ts";
import { createProviderGateway } from "../providers/gateway.ts";
import { createMockProvider } from "../providers/mock/adapter.ts";
import { ProviderUnavailableError } from "../providers/errors.ts";
import type { IpoDataProvider } from "../providers/provider.ts";
import { createQuotaGate } from "../providers/quota.ts";
import { createLogger } from "../shared/logger.ts";

const now = new Date("2026-10-18T04:30:00.000Z");
const logger = createLogger({ level: "error", service: "test", sink: () => undefined });

function source(): SourceMetadataRecord {
  return { source: "fixture", fetchedAt: now, sourceUpdatedAt: null, freshness: "fresh" };
}

function company(id: string, name: string): CompanyRecord {
  return { id, name, symbol: null, source: source() };
}

function ipo(id: string, status: IpoStatus | null): IpoRecord {
  return {
    id,
    slug: id,
    companyId: id,
    board: "mainboard",
    status,
    issue: {
      priceBandLowRupees: null,
      priceBandHighRupees: null,
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: null,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: null, closeDate: null, allotmentDate: null, listingDate: null },
    listing: null,
    registrarId: null,
    providerMappings: [],
    source: source(),
  };
}

function memoryPersistence() {
  const companies: CompanyRecord[] = [];
  const ipos: IpoRecord[] = [];
  const gmp: GmpObservationRecord[] = [];
  const subscriptions: SubscriptionObservationRecord[] = [];
  const financials: FinancialStatementRecord[] = [];
  const registrars: RegistrarRecord[] = [];
  const sources: SourceDocumentRecord[] = [];
  const runs: SyncRunRecord[] = [];
  const usage: { usageId: string; endpoint: string; statusCode: number; durationMs: number | null }[] = [];
  const expiresAt = new Date("2027-01-01T00:00:00.000Z");
  const unused = async () => {
    throw new Error("Unexpected store call.");
  };

  const store: PersistenceStore = {
    companies: {
      upsert: async (record) => {
        const index = companies.findIndex((item) => item.id === record.id);
        if (index >= 0) companies[index] = record;
        else companies.push(record);
        return record;
      },
      findById: async (id) => companies.find((item) => item.id === id) ?? null,
      findByName: unused,
      list: async () => companies,
    },
    ipos: {
      upsert: async (record) => {
        const index = ipos.findIndex((item) => item.id === record.id);
        if (index >= 0) ipos[index] = record;
        else ipos.push(record);
        return record;
      },
      findById: async (id) => ipos.find((item) => item.id === id) ?? null,
      findBySlug: async (slug) => ipos.find((item) => item.slug === slug) ?? null,
      findByProvider: async (providerKey, externalId) =>
        ipos.find((item) => item.providerMappings.some((mapping) => mapping.providerKey === providerKey && mapping.externalId === externalId)) ?? null,
      list: async () => ipos,
    },
    gmp: {
      upsert: async (record) => {
        const stored = { ...record, expiresAt };
        const index = gmp.findIndex((item) => item.ipoId === record.ipoId && item.observedAt.getTime() === record.observedAt.getTime() && item.session === record.session);
        if (index >= 0) gmp[index] = stored;
        else gmp.push(stored);
        return stored;
      },
      findByIpo: async (ipoId) => gmp.filter((item) => item.ipoId === ipoId),
    },
    subscriptions: {
      upsert: async (record) => {
        const stored = { ...record, expiresAt };
        const index = subscriptions.findIndex(
          (item) => item.ipoId === record.ipoId && (item.observedAt?.getTime() ?? null) === (record.observedAt?.getTime() ?? null),
        );
        if (index >= 0) subscriptions[index] = stored;
        else subscriptions.push(stored);
        return stored;
      },
      findByIpo: async (ipoId) => subscriptions.filter((item) => item.ipoId === ipoId),
    },
    financials: {
      upsert: async (record) => {
        const index = financials.findIndex((item) => item.companyId === record.companyId && item.fiscalYearLabel === record.fiscalYearLabel);
        if (index >= 0) financials[index] = record;
        else financials.push(record);
        return record;
      },
      findByCompany: async (companyId) => financials.filter((item) => item.companyId === companyId),
    },
    registrars: {
      upsert: async (record) => {
        const index = registrars.findIndex((item) => item.id === record.id);
        if (index >= 0) registrars[index] = record;
        else registrars.push(record);
        return record;
      },
      findById: async (id) => registrars.find((item) => item.id === id) ?? null,
    },
    sources: {
      upsert: async (record) => {
        const index = sources.findIndex((item) => item.ipoId === record.ipoId && item.kind === record.kind && item.url === record.url);
        if (index >= 0) sources[index] = record;
        else sources.push(record);
        return record;
      },
      findByIpo: async (ipoId) => sources.filter((item) => item.ipoId === ipoId),
    },
    sync: {
      upsert: async (record) => {
        const stored = { ...record, expiresAt };
        const index = runs.findIndex(
          (item) => item.providerKey === record.providerKey && item.resource === record.resource && item.startedAt.getTime() === record.startedAt.getTime(),
        );
        if (index >= 0) runs[index] = stored;
        else runs.push(stored);
        return stored;
      },
      findByProvider: async (providerKey) => runs.filter((item) => item.providerKey === providerKey),
    },
    usage: {
      upsert: async (record) => {
        const index = usage.findIndex((item) => item.usageId === record.usageId);
        const stored = {
          usageId: record.usageId,
          endpoint: record.endpoint,
          statusCode: record.statusCode,
          durationMs: record.durationMs,
        };
        if (index >= 0) usage[index] = stored;
        else usage.push(stored);
        return { ...record, expiresAt };
      },
      findByProvider: unused,
    },
  };

  return { store, companies, ipos, gmp, subscriptions, financials, runs, usage };
}

function counting(inner: IpoDataProvider): { provider: IpoDataProvider; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    provider: new Proxy(inner, {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          calls.push(String(property));
          return (value as (...items: unknown[]) => unknown).apply(target, args);
        };
      },
    }),
  };
}

function context(input: {
  store: PersistenceStore;
  provider?: IpoDataProvider;
  policy?: ReturnType<typeof defaultSyncPolicy>;
  quota?: SyncContext["quota"];
  locks?: SyncContext["locks"];
  cache?: SyncContext["cache"];
  providerKey?: SyncContext["providerKey"];
}): { context: SyncContext; calls: string[]; loads: { count: number } } {
  const wrapped = counting(input.provider ?? createMockProvider({ now: () => now }));
  const loads = { count: 0 };
  const cache =
    input.cache ??
    createCacheService({
      store: createMemoryStore(() => now.getTime()),
      policy: defaultCachePolicy(),
      logger,
      now: () => now,
    });
  return {
    calls: wrapped.calls,
    loads,
    context: {
      providerKey: input.providerKey ?? "mock",
      gateway: createProviderGateway({ primary: wrapped.provider, now: () => now, timeoutMs: 1000, scheduleTimeout: () => () => undefined }),
      quota: input.quota ?? createQuotaGate({ policy: defaultQuotaPolicy(), now: () => now, sleep: async () => undefined, random: () => 0, logger }),
      store: input.store,
      cache,
      locks: input.locks ?? createSyncLock(createMemoryStore(() => now.getTime())),
      policy: input.policy ?? defaultSyncPolicy(),
      now: () => now,
      logger,
    },
  };
}

describe("IPO synchronization", () => {
  it("does not start a worker when the API module is loaded", async () => {
    await import("../worker.ts");
    assert.equal(jobsStatus, "not_configured");
  });

  it("refuses a listed interval that is shorter than the open interval", () => {
    assert.throws(
      () => readSyncPolicy({ SYNC_GMP_LISTED_MS: "1000" }),
      (error: unknown) => error instanceof ConfigError && error.fields.includes("SYNC_GMP_LISTED_MS"),
    );
  });

  it("plans open issues before upcoming issues and skips a recent listed refresh", () => {
    const policy = defaultSyncPolicy();
    const recent = new Date(now.getTime() - 60 * 60 * 1000);
    const planned = planIssueSync({
      now,
      policy,
      ipos: [
        { id: "fixture-listed", status: "listed" },
        { id: "fixture-upcoming", status: "upcoming" },
        { id: "fixture-open", status: "open" },
      ],
      lastSuccessAt: (category, subject) => (category === "gmp" && subject !== "fixture-open" ? recent : null),
    });
    assert.equal(planned[0]?.subject, "fixture-open");
    assert.equal(planned[0]?.category, "gmp");
    assert.equal(
      planned.some((item) => item.subject === "fixture-listed" && item.category === "gmp"),
      false,
    );
    assert.equal(
      planned.some((item) => item.subject === "fixture-upcoming" && item.category === "gmp"),
      false,
    );
  });

  it("stores mock provider data once and does not call the provider again inside the interval", async () => {
    const saved = memoryPersistence();
    const policy = defaultSyncPolicy();
    const run = context({ store: saved.store, policy });
    const first = await runSyncTick(run.context);
    assert.equal(first.some((item) => item.status === "failed"), false);
    assert.equal(saved.companies[0]?.name, "Fixture Polymers");
    assert.equal(saved.ipos[0]?.slug, "fixture-polymers");
    assert.equal(saved.gmp[0]?.amountRupees, 0);
    assert.equal(saved.subscriptions[0]?.totalTimes, 0);
    assert.equal(saved.financials[0]?.profitAfterTaxRupees, 0);
    assert.equal(saved.financials[0]?.revenueRupees, null);
    assert.equal(saved.runs.some((item) => item.resource === "catalog-catalogue" && item.status === "succeeded"), true);
    assert.ok(saved.usage.length > 0);
    assert.ok(saved.usage.every((item) => item.endpoint.startsWith("/sync/") && item.durationMs !== null && item.durationMs >= 0));
    const callsAfterFirst = run.calls.length;
    assert.ok(callsAfterFirst > 0);
    const second = await runSyncTick(run.context);
    assert.deepEqual(second, []);
    assert.equal(run.calls.length, callsAfterFirst);
    assert.equal(saved.gmp.length, 1);
  });

  it("retries a provider failure with backoff and then writes", async () => {
    const saved = memoryPersistence();
    saved.companies.push(company("fixture-polymers", "Fixture Polymers"));
    saved.ipos.push(ipo("fixture-polymers", "open"));
    let remaining = 1;
    const provider = createMockProvider({ now: () => now });
    const flaky: IpoDataProvider = {
      ...provider,
      getCurrentGmp: (id) => {
        if (remaining > 0) {
          remaining -= 1;
          throw new ProviderUnavailableError("mock", "currentGmp");
        }
        return provider.getCurrentGmp(id);
      },
    };
    const delays: number[] = [];
    const quota = createQuotaGate({
      policy: { ...defaultQuotaPolicy(), maxRetries: 1, backoffBaseMs: 25, backoffMaxMs: 25 },
      now: () => now,
      sleep: async (ms) => {
        delays.push(ms);
      },
      random: () => 0,
      logger,
    });
    const run = context({
      store: saved.store,
      provider: flaky,
      quota,
      policy: { ...defaultSyncPolicy(), maxCallsPerTick: 2 },
    });
    const results = await runSyncTick(run.context, ["gmp"]);
    assert.equal(results[0]?.status, "succeeded");
    assert.equal(delays[0], 25);
    assert.equal(saved.gmp[0]?.amountRupees, 0);
    assert.equal(remaining, 0);
  });

  it("keeps the last GMP when a refresh is malformed and does not drop the cache", async () => {
    const saved = memoryPersistence();
    saved.companies.push(company("fixture-polymers", "Fixture Polymers"));
    saved.ipos.push(ipo("fixture-polymers", "open"));
    saved.gmp.push({
      ipoId: "fixture-polymers",
      observedAt: now,
      session: "daily",
      amountRupees: 7,
      percent: null,
      indicativeImpliedPriceRupees: null,
      source: source(),
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });
    const cacheStore = createMemoryStore(() => now.getTime());
    const cache = createCacheService({ store: cacheStore, policy: defaultCachePolicy(), logger, now: () => now });
    let loads = 0;
    await cache.getOrLoad({
      namespace: "public",
      resource: "gmp",
      id: "fixture-polymers",
      meter: "public",
      load: async () => {
        loads += 1;
        return { amountRupees: 7 };
      },
      parse: (value) => value as { amountRupees: number },
    });
    const run = context({
      store: saved.store,
      provider: createMockProvider({ now: () => now, behavior: { currentGmp: "malformed" } }),
      quota: createQuotaGate({ policy: { ...defaultQuotaPolicy(), maxRetries: 0 }, now: () => now, sleep: async () => undefined, random: () => 0, logger }),
      cache,
    });
    const results = await runSyncTick(run.context, ["gmp"]);
    assert.equal(results[0]?.status, "failed");
    assert.equal(results[0]?.errorName, "ProviderPayloadError");
    assert.equal(saved.gmp.length, 1);
    assert.equal(saved.gmp[0]?.amountRupees, 7);
    const cached = await cache.getOrLoad({
      namespace: "public",
      resource: "gmp",
      id: "fixture-polymers",
      meter: "public",
      load: async () => {
        loads += 1;
        return { amountRupees: 0 };
      },
      parse: (value) => value as { amountRupees: number },
    });
    assert.equal(cached.value.amountRupees, 7);
    assert.equal(loads, 1);
    assert.equal(saved.runs.some((item) => item.status === "failed" && item.finishedAt), true);
  });

  it("invalidates the public cache after a successful write", async () => {
    const saved = memoryPersistence();
    saved.companies.push(company("fixture-polymers", "Fixture Polymers"));
    saved.ipos.push(ipo("fixture-polymers", "open"));
    const cache = createCacheService({ store: createMemoryStore(() => now.getTime()), policy: defaultCachePolicy(), logger, now: () => now });
    let loads = 0;
    await cache.getOrLoad({
      namespace: "public",
      resource: "gmp",
      id: "fixture-polymers",
      meter: "public",
      load: async () => {
        loads += 1;
        return "previous";
      },
      parse: (value) => String(value),
    });
    const run = context({ store: saved.store, cache });
    const results = await runSyncTick(run.context, ["gmp"]);
    assert.equal(results[0]?.status, "succeeded");
    assert.ok((results[0]?.durationMs ?? -1) >= 0);
    const cached = await cache.getOrLoad({
      namespace: "public",
      resource: "gmp",
      id: "fixture-polymers",
      meter: "public",
      load: async () => {
        loads += 1;
        return "current";
      },
      parse: (value) => String(value),
    });
    assert.equal(cached.value, "current");
    assert.equal(loads, 2);
  });

  it("syncs the open issue first and stops at the call budget", async () => {
    const saved = memoryPersistence();
    saved.ipos.push(ipo("fixture-listed", "listed"), ipo("fixture-open", "open"));
    const policy = defaultSyncPolicy();
    const run = context({ store: saved.store, policy: { ...policy, maxCallsPerTick: 1 } });
    await runSyncTick(run.context, ["gmp"]);
    assert.deepEqual(
      saved.gmp.map((item) => item.ipoId),
      ["fixture-open"],
    );
    assert.equal(run.calls.filter((call) => call === "getCurrentGmp").length, 1);
  });

  it("lets one instance skip a catalog locked by another instance", async () => {
    const saved = memoryPersistence();
    const shared = createMemoryStore(() => now.getTime());
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = createMockProvider({ now: () => now });
    let listed = 0;
    const slow: IpoDataProvider = {
      ...provider,
      listIpos: async (query) => {
        listed += 1;
        if (listed === 1) await gate;
        return provider.listIpos(query);
      },
    };
    const first = context({ store: saved.store, provider: slow, locks: createSyncLock(shared) });
    const second = context({ store: saved.store, provider: slow, locks: createSyncLock(shared) });
    const running = runSyncTick(first.context, ["catalog"]);
    for (let attempt = 0; attempt < 50 && listed < 1; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(listed, 1);
    const skipped = await runSyncTick(second.context, ["catalog"]);
    assert.equal(skipped[0]?.status, "skipped");
    assert.equal(listed, 1);
    release();
    const finished = await running;
    assert.equal(finished[0]?.status, "succeeded");
  });

  it("does not call IPO Guru and refuses a production manual sync", async () => {
    const saved = memoryPersistence();
    const run = context({ store: saved.store, providerKey: "ipo-guru" });
    const skipped = await runSyncTick(run.context);
    assert.deepEqual(skipped, []);
    assert.deepEqual(run.calls, []);
    await assert.rejects(() => runManualSync("production", run.context), ManualSyncError);
    assert.deepEqual(run.calls, []);
    assert.throws(() => assertManualSyncAllowed("production", "development-token-1"), ManualSyncError);
    assert.throws(() => assertManualSyncAllowed("development", undefined), ManualSyncError);
    assert.throws(() => assertManualSyncAllowed("development", "short"), ManualSyncError);
    assert.doesNotThrow(() => assertManualSyncAllowed("development", "development-token-1"));
  });

  it("shuts the worker down without starting another tick", async () => {
    let release: () => void = () => undefined;
    let runs = 0;
    const queued: Array<() => void> = [];
    const worker = createSyncWorker({
      tickMs: 1_000,
      logger,
      schedule: (_ms, run) => {
        queued.push(() => run());
        return {
          cancel() {
            queued.length = 0;
          },
        };
      },
      run: () => {
        runs += 1;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    });
    worker.start();
    const invoke = queued[0];
    if (!invoke) throw new Error("The worker did not schedule a tick.");
    invoke();
    queued.length = 0;
    const stopped = worker.stop();
    release();
    await stopped;
    assert.equal(runs, 1);
    assert.equal(queued.length, 0);
  });
});
