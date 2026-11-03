import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStore } from "../cache/memory-store.ts";
import { createCacheService } from "../cache/service.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import { readConfig } from "../config/env.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import { defaultSyncPolicy, gmpCollectionDefaultMs } from "../config/sync-policy.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import type { GmpObservationRecord, IpoRecord, SyncRunRecord } from "../db/records.ts";
import { createSyncLock } from "./lock.ts";
import { runSyncTick, type SyncContext } from "./sync-service.ts";
import { createProviderGateway } from "../providers/gateway.ts";
import { createIpoGuruProvider } from "../providers/ipo-guru/adapter.ts";
import { createIpoGuruClient } from "../providers/ipo-guru/client.ts";
import type { IpoGuruTransport } from "../providers/ipo-guru/transport.ts";
import { createLogger } from "../shared/logger.ts";

const key = "test-key-value-0001";
const logger = createLogger({ level: "error", service: "gmp-sync-test", sink: () => undefined });

function issue(slug: string, status: IpoRecord["status"], issuePrice: number | null): IpoRecord {
  return {
    id: slug,
    slug,
    companyId: slug,
    board: slug.includes("sme") ? "sme" : "mainboard",
    status,
    issue: {
      priceBandLowRupees: issuePrice === null ? null : 140,
      priceBandHighRupees: issuePrice,
      issuePriceRupees: issuePrice,
      issueSizeRupees: null,
      lotSizeShares: null,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: "2026-09-22", closeDate: "2026-09-24", allotmentDate: null, listingDate: null },
    listing: null,
    registrarId: null,
    providerMappings: [{ providerKey: "ipo-guru", externalId: slug }],
    source: {
      source: "IPO Guru Pro",
      fetchedAt: new Date("2026-09-22T07:00:00.000Z"),
      sourceUpdatedAt: null,
      freshness: "fresh",
    },
  };
}

function collectionRow(slug: string, price: string | null, issuePrice: string | null): Record<string, unknown> {
  return {
    slug,
    name: slug,
    type: slug.includes("sme") ? "SME" : "Mainboard",
    status: "Open",
    price_band: null,
    issue_price: issuePrice,
    gmp: {
      price,
      percentage: price === "7.5" ? "5.07" : price === "0" ? "0" : null,
      estimated_listing_price: price === "7.5" ? 155.5 : price === "0" ? 148 : null,
      updated_at: price === null ? null : "2026-09-22T07:06:09.000000Z",
    },
  };
}

function harness(input?: { status?: () => number; maxRetries?: number; dayUsed?: number }) {
  const urls: string[] = [];
  let clock = new Date("2026-09-22T07:06:09.000Z");
  const ipos = [
    issue("varmora-granito-ipo", "open", 148),
    issue("sample-sme-ipo", "upcoming", null),
    issue("closed-mills-ipo", "closed", 100),
  ];
  const observations: GmpObservationRecord[] = [];
  const runs: SyncRunRecord[] = [
    {
      providerKey: "ipo-guru",
      resource: "catalog-catalogue",
      startedAt: new Date(clock),
      finishedAt: new Date(clock),
      status: "succeeded",
      fetchedCount: 0,
      errorName: null,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    },
  ];
  const transport: IpoGuruTransport = async (request) => {
    urls.push(request.url);
    assert.equal(request.url.includes(key), false);
    return {
      status: input?.status?.() ?? 200,
      headers: { "x-plan": "standard" },
      body: JSON.stringify({
        success: true,
        plan: "standard",
        data: [
          collectionRow("varmora-granito-ipo", "7.5", "148"),
          collectionRow("sample-sme-ipo", "0", null),
          collectionRow("closed-mills-ipo", "4", "100"),
          collectionRow("varmora-granito-ipo", "9", "148"),
          { slug: "unknown-ipo", gmp: { price: "3", updated_at: "2026-09-22T07:06:09.000000Z" } },
        ],
      }),
    };
  };
  const config = readConfig(
    {
      IPOGURU_ENABLED: "true",
      IPOGURU_API_KEY: key,
      IPOGURU_MINUTE_BUDGET: "20",
      IPOGURU_DAILY_BUDGET: "1000",
    },
    "0.1.0",
  );
  const client = createIpoGuruClient({
    settings: config.ipoGuru,
    quotaPolicy: { ...defaultQuotaPolicy(), maxRetries: input?.maxRetries ?? 0, backoffBaseMs: 1, backoffMaxMs: 1 },
    logger,
    transport,
    now: () => clock,
    sleep: async () => undefined,
  });
  const unused = async () => {
    throw new Error("Unexpected store call.");
  };
  const store: PersistenceStore = {
    companies: { upsert: unused, findById: async () => null, findByName: unused, list: async () => [] },
    ipos: {
      upsert: unused,
      findById: async (id) => ipos.find((item) => item.id === id) ?? null,
      findBySlug: async (slug) => ipos.find((item) => item.slug === slug) ?? null,
      findByProvider: unused,
      list: async () => ipos,
    },
    gmp: {
      upsert: async (record) => {
        const stored = { ...record, expiresAt: new Date("2027-10-27T00:00:00.000Z") };
        const index = observations.findIndex(
          (item) => item.ipoId === stored.ipoId && item.observedAt.getTime() === stored.observedAt.getTime() && item.session === stored.session,
        );
        if (index >= 0) observations[index] = stored;
        else observations.push(stored);
        return stored;
      },
      findByIpo: async (ipoId) => observations.filter((item) => item.ipoId === ipoId),
    },
    subscriptions: { upsert: unused, findByIpo: async () => [] },
    financials: { upsert: unused, findByCompany: async () => [] },
    registrars: { upsert: unused, findById: async () => null },
    sources: { upsert: unused, findByIpo: async () => [] },
    sync: {
      upsert: async (record) => {
        const stored = { ...record, expiresAt: new Date("2027-01-01T00:00:00.000Z") };
        runs.push(stored);
        return stored;
      },
      findByProvider: async (providerKey) => runs.filter((item) => item.providerKey === providerKey),
    },
    usage: {
      upsert: async (record) => ({ ...record, expiresAt: new Date("2027-01-01T00:00:00.000Z") }),
      findByProvider: async () => [],
    },
  };
  const context: SyncContext = {
    providerKey: "ipo-guru",
    ipoGuruCatalog: true,
    loadCurrentGmp: () => client.listCurrentGmp(),
    gmpBudget: { requestsPerDay: 1_000, reservedRequests: 50 },
    gateway: createProviderGateway({ primary: createIpoGuruProvider({ client, now: () => clock }), now: () => clock, timeoutMs: 1_000, scheduleTimeout: () => () => undefined }),
    quota: {
      snapshot: async () => ({ minuteUsed: 0, dayUsed: input?.dayUsed ?? 0 }),
      run: async (load) => load(),
    },
    store,
    cache: createCacheService({ store: createMemoryStore(() => clock.getTime()), policy: defaultCachePolicy(), logger, now: () => clock }),
    locks: createSyncLock(createMemoryStore(() => clock.getTime())),
    policy: defaultSyncPolicy(),
    now: () => clock,
    logger,
  };
  return {
    urls,
    observations,
    context,
    client,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

describe("IPO Guru current GMP sync", () => {
  it("fetches the collection once, matches slugs, and does not repeat inside the interval", async () => {
    const run = harness();
    const [first, second] = await Promise.all([runSyncTick(run.context), runSyncTick(run.context)]);
    const statuses = [first[0]?.status, second[0]?.status].sort();
    assert.deepEqual(statuses, ["skipped", "succeeded"]);
    assert.deepEqual(run.urls, ["https://www.ipoguru.in/api/v2/gmp"]);
    assert.equal(run.observations.length, 2);
    const varmora = run.observations.find((item) => item.ipoId === "varmora-granito-ipo");
    const sme = run.observations.find((item) => item.ipoId === "sample-sme-ipo");
    assert.equal(varmora?.amountRupees, 7.5);
    assert.equal(varmora?.percent, 5.07);
    assert.equal(varmora?.indicativeImpliedPriceRupees, 155.5);
    assert.equal(varmora?.source.source, "IPO Guru Pro");
    assert.equal(varmora?.source.sourceUpdatedAt?.toISOString(), "2026-09-22T07:06:09.000Z");
    assert.equal(sme?.amountRupees, 0);
    assert.equal(run.observations.some((item) => item.ipoId === "closed-mills-ipo"), false);

    const cached = await run.context.cache.getOrLoad({
      namespace: "provider",
      resource: "gmp",
      id: "collection",
      load: async () => {
        run.urls.push("cache-miss");
        return [];
      },
      parse: (value) => value,
    });
    assert.equal(cached.source, "cache");
    assert.equal(run.urls.length, 1);

    run.advance(gmpCollectionDefaultMs - 1_000);
    assert.deepEqual(await runSyncTick(run.context), []);
    assert.equal(run.urls.length, 1);

    run.advance(1_000);
    const refreshed = await runSyncTick(run.context);
    assert.equal(refreshed[0]?.status, "succeeded");
    assert.equal(run.urls.length, 2);
    assert.equal(run.observations.length, 2);
  });

  it("keeps stored premiums when the collection is empty or the provider is down", async () => {
    const down = harness({ status: () => 503, maxRetries: 1 });
    down.observations.push({
      ipoId: "varmora-granito-ipo",
      observedAt: new Date("2026-09-22T07:06:09.000Z"),
      session: "daily",
      amountRupees: 7.5,
      percent: 5.07,
      indicativeImpliedPriceRupees: 155.5,
      source: {
        source: "IPO Guru Pro",
        fetchedAt: new Date("2026-09-22T07:06:09.000Z"),
        sourceUpdatedAt: new Date("2026-09-22T07:06:09.000Z"),
        freshness: "fresh",
      },
      expiresAt: new Date("2027-10-27T00:00:00.000Z"),
    });
    const failed = await runSyncTick(down.context);
    assert.equal(failed[0]?.status, "failed");
    assert.equal(down.urls.length, 2);
    assert.equal(down.observations[0]?.amountRupees, 7.5);

    const empty = harness();
    empty.observations.push({
      ipoId: "varmora-granito-ipo",
      observedAt: new Date("2026-09-22T07:06:09.000Z"),
      session: "daily",
      amountRupees: 7.5,
      percent: 5.07,
      indicativeImpliedPriceRupees: 155.5,
      source: {
        source: "IPO Guru Pro",
        fetchedAt: new Date("2026-09-22T07:06:09.000Z"),
        sourceUpdatedAt: new Date("2026-09-22T07:06:09.000Z"),
        freshness: "fresh",
      },
      expiresAt: new Date("2027-10-27T00:00:00.000Z"),
    });
    empty.context.loadCurrentGmp = async () => [];
    const cleared = await runSyncTick(empty.context);
    assert.equal(cleared[0]?.status, "succeeded");
    assert.equal(empty.observations.length, 1);
    assert.equal(empty.observations[0]?.amountRupees, 7.5);
    assert.equal(empty.urls.length, 0);
  });

  it("refuses a closed GMP query before any request and stretches the interval when budget is tight", async () => {
    const run = harness({ dayUsed: 960 });
    await assert.rejects(() => run.client.listCurrentGmp({ status: "closed" as "open" }), /IPO Guru request failed/);
    assert.equal(run.urls.length, 0);
    run.advance(3 * 60 * 60 * 1000);
    const first = await runSyncTick(run.context);
    assert.equal(first[0]?.status, "succeeded");
    assert.equal(run.urls.length, 1);
    run.advance(gmpCollectionDefaultMs);
    assert.deepEqual(await runSyncTick(run.context), []);
    assert.equal(run.urls.length, 1);
  });
});
