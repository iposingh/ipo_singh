import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStore } from "../cache/memory-store.ts";
import { createCacheService } from "../cache/service.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import { readConfig } from "../config/env.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import { defaultSyncPolicy } from "../config/sync-policy.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import type { GmpHistoryWindowRecord, GmpObservationRecord, IpoRecord, SyncRunRecord } from "../db/records.ts";
import { createSyncLock } from "./lock.ts";
import { runSyncTick, type SyncContext } from "./sync-service.ts";
import { createProviderGateway } from "../providers/gateway.ts";
import { createIpoGuruProvider } from "../providers/ipo-guru/adapter.ts";
import { createIpoGuruClient } from "../providers/ipo-guru/client.ts";
import type { IpoGuruTransport } from "../providers/ipo-guru/transport.ts";
import { createLogger } from "../shared/logger.ts";

const key = "test-key-value-0001";
const logger = createLogger({ level: "error", service: "gmp-history-sync-test", sink: () => undefined });

function issue(slug: string, status: IpoRecord["status"]): IpoRecord {
  return {
    id: slug,
    slug,
    companyId: slug,
    board: "mainboard",
    status,
    issue: {
      priceBandLowRupees: 120,
      priceBandHighRupees: 138,
      issuePriceRupees: 138,
      issueSizeRupees: null,
      lotSizeShares: null,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: "2026-08-29", closeDate: "2026-09-02", allotmentDate: null, listingDate: null },
    listing: null,
    registrarId: null,
    providerMappings: [{ providerKey: "ipo-guru", externalId: slug }],
    source: {
      source: "IPO Guru Pro",
      fetchedAt: new Date("2026-08-31T05:00:00.000Z"),
      sourceUpdatedAt: null,
      freshness: "fresh",
    },
  };
}

function historyBody(): string {
  return JSON.stringify({
    success: true,
    plan: "pro",
    data: {
      summary: {
        high: { price: 32, date: "2026-08-31" },
        low: { price: 0, date: "2026-08-29" },
        issue_price: 138,
      },
      trend: [
        { date: "2026-08-29", price: "0", price_value: 0, percentage: "0", estimated_listing_price: 138 },
        { date: "2026-08-31", price: "32", price_value: 32, percentage: "23.19", estimated_listing_price: 170 },
      ],
      timeline: [
        {
          date: "2026-08-31",
          slot: 11,
          slot_label: "11 AM",
          recorded_at: "2026-08-31 10:48:02",
          price_value: 32,
          percentage: "23.19",
          estimated_listing_price: 170,
        },
      ],
      truncated: false,
    },
  });
}

function harness(input?: { status?: () => number; maxRetries?: number; ipos?: IpoRecord[]; maxCalls?: number }) {
  const urls: string[] = [];
  let clock = new Date("2026-08-31T05:20:00.000Z");
  const ipos = input?.ipos ?? [issue("open-mills-ipo", "open"), issue("soon-mills-ipo", "upcoming"), issue("listed-mills-ipo", "listed")];
  const observations: GmpObservationRecord[] = [];
  const windows: GmpHistoryWindowRecord[] = [];
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
    assert.equal(request.url.includes("subscription"), false);
    return {
      status: input?.status?.() ?? 200,
      headers: { "x-plan": "pro" },
      body: historyBody(),
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
    gmpWindows: {
      upsert: async (record) => {
        const index = windows.findIndex((item) => item.ipoId === record.ipoId);
        if (index >= 0) windows[index] = record;
        else windows.push(record);
        return record;
      },
      findByIpo: async (ipoId) => windows.find((item) => item.ipoId === ipoId) ?? null,
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
    loadGmpHistory: (slug) => client.readGmpHistory(slug),
    gateway: createProviderGateway({
      primary: createIpoGuruProvider({ client, now: () => clock }),
      now: () => clock,
      timeoutMs: 1_000,
      scheduleTimeout: () => () => undefined,
    }),
    quota: {
      snapshot: async () => ({ minuteUsed: 0, dayUsed: 0 }),
      run: async (load) => load(),
    },
    store,
    cache: createCacheService({ store: createMemoryStore(() => clock.getTime()), policy: defaultCachePolicy(), logger, now: () => clock }),
    locks: createSyncLock(createMemoryStore(() => clock.getTime())),
    policy: { ...defaultSyncPolicy(), maxCallsPerTick: input?.maxCalls ?? 8 },
    now: () => clock,
    logger,
  };
  return {
    urls,
    observations,
    windows,
    context,
    client,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

describe("IPO Guru GMP history sync", () => {
  it("fetches one history URL per active due issue and does not repeat a completed window", async () => {
    const run = harness();
    const [first, second] = await Promise.all([runSyncTick(run.context), runSyncTick(run.context)]);
    const statuses = [...first, ...second].map((item) => item.status).sort();
    assert.equal(statuses.filter((status) => status === "succeeded").length, 2);
    assert.equal(run.urls.length, 2);
    assert.equal(new Set(run.urls).size, 2);
    assert.ok(run.urls.every((url) => !url.includes("listed-mills-ipo")));
    assert.ok(run.urls.every((url) => url.startsWith("https://www.ipoguru.in/api/v2/ipos/") && url.endsWith("/gmp/history")));
    const daily = run.observations.filter((item) => item.session === "daily" && item.ipoId === "open-mills-ipo");
    assert.deepEqual(
      daily.map((item) => item.amountRupees).sort((left, right) => (left ?? 0) - (right ?? 0)),
      [0, 32],
    );
    const intraday = run.observations.find((item) => item.session === "intraday" && item.ipoId === "open-mills-ipo");
    assert.equal(intraday?.observedAt.toISOString(), "2026-08-31T05:18:02.000Z");
    assert.equal(intraday?.slotLabel, "11 AM");
    assert.equal(intraday?.source.source, "IPO Guru Pro");
    assert.equal(run.windows.find((item) => item.ipoId === "open-mills-ipo")?.lowRupees, 0);

    run.advance(8 * 24 * 60 * 60 * 1000);
    const again = await runSyncTick(run.context);
    const againUrls = run.urls.slice(2);
    assert.equal(againUrls.some((url) => url.includes("listed-mills-ipo")), false);
    assert.equal(againUrls.filter((url) => url.includes("open-mills-ipo")).length, 1);
    assert.equal(again.some((item) => item.resource.includes("listed")), false);
  });

  it("stops at the tick budget instead of fetching every listed issue", async () => {
    const ipos = Array.from({ length: 10 }, (_item, index) => issue(`open-mills-${index}`, "open"));
    const run = harness({ ipos, maxCalls: 3 });
    const results = await runSyncTick(run.context);
    assert.equal(results.filter((item) => item.status === "succeeded").length, 3);
    assert.equal(run.urls.length, 3);
  });

  it("keeps stored history when the provider fails and does not invent points for a locked timeline", async () => {
    const down = harness({ status: () => 503, maxRetries: 1 });
    down.observations.push({
      ipoId: "open-mills-ipo",
      observedAt: new Date("2026-08-30T18:30:00.000Z"),
      observedOn: "2026-08-31",
      session: "daily",
      amountRupees: 32,
      percent: 23.19,
      indicativeImpliedPriceRupees: null,
      slotLabel: null,
      source: {
        source: "IPO Guru Pro",
        fetchedAt: new Date("2026-08-31T05:00:00.000Z"),
        sourceUpdatedAt: null,
        freshness: "fresh",
      },
      expiresAt: new Date("2027-10-27T00:00:00.000Z"),
    });
    const failed = await runSyncTick(down.context);
    assert.ok(failed.some((item) => item.status === "failed"));
    assert.equal(down.observations.find((item) => item.ipoId === "open-mills-ipo")?.amountRupees, 32);
    assert.ok(down.urls.length >= 2);
    assert.ok(down.urls.every((url) => url.endsWith("/gmp/history")));

    const locked = harness();
    locked.context.loadGmpHistory = async () => ({
      summary: { issue_price: 138, high: null, low: null },
      trend: [],
      timeline: [],
      locked: ["timeline"],
    });
    const saved = await runSyncTick(locked.context);
    assert.ok(saved.every((item) => item.status === "succeeded"));
    assert.equal(locked.observations.length, 0);
    assert.equal(locked.windows[0]?.timelineLocked, true);
    assert.equal(locked.windows[0]?.truncated, false);
    await assert.rejects(() => locked.client.readGmpHistory("../secret"), /IPO Guru request failed/);
    assert.equal(locked.urls.length, 0);
  });
});
