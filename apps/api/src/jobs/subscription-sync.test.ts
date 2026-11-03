import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStore } from "../cache/memory-store.ts";
import { createCacheService } from "../cache/service.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import { readConfig } from "../config/env.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import { defaultSyncPolicy } from "../config/sync-policy.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import type { IpoRecord, SubscriptionObservationRecord, SyncRunRecord } from "../db/records.ts";
import { createSyncLock } from "./lock.ts";
import { runSyncTick, type SyncContext } from "./sync-service.ts";
import { createProviderGateway } from "../providers/gateway.ts";
import { createIpoGuruProvider } from "../providers/ipo-guru/adapter.ts";
import { createIpoGuruClient } from "../providers/ipo-guru/client.ts";
import type { IpoGuruTransport } from "../providers/ipo-guru/transport.ts";
import { createLogger } from "../shared/logger.ts";

const key = "test-key-value-0001";
const logger = createLogger({ level: "error", service: "subscription-sync-test", sink: () => undefined });

function issue(slug: string, status: IpoRecord["status"]): IpoRecord {
  return {
    id: slug,
    slug,
    companyId: slug,
    board: "mainboard",
    status,
    issue: {
      priceBandLowRupees: 100,
      priceBandHighRupees: 120,
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: null,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: "2026-08-24", closeDate: "2026-08-28", allotmentDate: null, listingDate: null },
    listing: null,
    registrarId: null,
    providerMappings: [{ providerKey: "ipo-guru", externalId: slug }],
    source: {
      source: "IPO Guru Pro",
      fetchedAt: new Date("2026-09-01T12:00:00.000Z"),
      sourceUpdatedAt: null,
      freshness: "fresh",
    },
  };
}

function currentBody(): string {
  return JSON.stringify({
    success: true,
    plan: "pro",
    data: {
      summary: {
        total: "12.5",
        qib: "8.25",
        nii: "4",
        retail: "0.8",
        employee: "0",
        shareholder: "0",
        anchor: null,
        updated_at: "2026-09-01T13:01:00.000000Z",
      },
      categories: [
        {
          key: "NII",
          times: "4",
          times_value: 4,
          sub_categories: [
            { key: "BNII", times: "3", times_value: 3 },
            { key: "SNII", times: "1", times_value: 1 },
          ],
        },
      ],
    },
  });
}

function historyBody(): string {
  return JSON.stringify({
    success: true,
    plan: "pro",
    data: {
      count: 2,
      day_wise: [
        { day: 1, date: "2026-08-24", time: "19:30:41", qib: "1", nii: null, retail: "0", employee: "0", shareholder: null, total: "0.8" },
        { day: 3, date: "2026-08-26", time: null, qib: null, nii: null, retail: null, employee: null, shareholder: "0", total: "12.5" },
      ],
    },
  });
}

function harness(input?: { status?: () => number; body?: () => string; ipos?: IpoRecord[]; maxCalls?: number }) {
  const urls: string[] = [];
  let clock = new Date("2026-09-01T13:05:00.000Z");
  const ipos = input?.ipos ?? [issue("open-mills-ipo", "open"), issue("soon-mills-ipo", "upcoming"), issue("listed-mills-ipo", "listed")];
  const observations: SubscriptionObservationRecord[] = [];
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
    assert.equal(request.url.includes("gmp"), false);
    const history = request.url.endsWith("/subscription/history");
    return {
      status: input?.status?.() ?? 200,
      headers: { "x-plan": "pro" },
      body: input?.body?.() ?? (history ? historyBody() : currentBody()),
    };
  };
  const config = readConfig({ IPOGURU_ENABLED: "true", IPOGURU_API_KEY: key, IPOGURU_MINUTE_BUDGET: "20", IPOGURU_DAILY_BUDGET: "1000" }, "0.1.0");
  const client = createIpoGuruClient({
    settings: config.ipoGuru,
    quotaPolicy: { ...defaultQuotaPolicy(), maxRetries: 0, backoffBaseMs: 1, backoffMaxMs: 1 },
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
    gmp: { upsert: unused, findByIpo: async () => [] },
    gmpWindows: { upsert: unused, findByIpo: async () => null },
    subscriptions: {
      upsert: async (record) => {
        const stored = { ...record, expiresAt: new Date("2027-10-27T00:00:00.000Z") };
        const index = observations.findIndex(
          (item) =>
            item.ipoId === stored.ipoId &&
            (item.cadence ?? null) === (stored.cadence ?? null) &&
            (item.observedOn ?? null) === (stored.observedOn ?? null) &&
            (item.observedAt?.getTime() ?? null) === (stored.observedAt?.getTime() ?? null),
        );
        if (index >= 0) observations[index] = stored;
        else observations.push(stored);
        return stored;
      },
      findByIpo: async (ipoId) => observations.filter((item) => item.ipoId === ipoId),
    },
    financials: { upsert: unused, findByCompany: async () => [] },
    registrars: { upsert: unused, findById: async () => null },
    sources: { upsert: unused, findByIpo: async () => [] },
    sync: {
      upsert: async (record) => {
        const stored = { ...record, expiresAt: new Date("2027-01-01T00:00:00.000Z") };
        const index = runs.findIndex(
          (item) => item.providerKey === stored.providerKey && item.resource === stored.resource && item.startedAt.getTime() === stored.startedAt.getTime(),
        );
        if (index >= 0) runs[index] = stored;
        else runs.push(stored);
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
    loadCurrentSubscription: (slug) => client.readSubscription(slug),
    loadSubscriptionHistory: (slug) => client.readSubscriptionHistory(slug),
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
    context,
    client,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

describe("IPO Guru subscription sync", () => {
  it("starts active bidding at 60 minutes and polls less often after bidding", () => {
    const policy = defaultSyncPolicy();
    assert.equal(policy.subscription.openMs, 60 * 60 * 1000);
    assert.ok(policy.subscription.upcomingMs > policy.subscription.openMs);
    assert.ok(policy.subscription.listedMs > policy.subscription.openMs);
    assert.ok(policy.subscription.otherMs > policy.subscription.openMs);
  });

  it("fetches one current and one history URL per active issue, skipping listed catalogue backfill", async () => {
    const run = harness();
    const [first, second] = await Promise.all([runSyncTick(run.context), runSyncTick(run.context)]);
    const succeeded = [...first, ...second].filter((item) => item.status === "succeeded");
    assert.equal(succeeded.length, 4);
    assert.equal(run.urls.length, 4);
    assert.equal(new Set(run.urls).size, 4);
    assert.ok(run.urls.filter((url) => url.endsWith("/subscription")).length === 2);
    assert.ok(run.urls.filter((url) => url.endsWith("/subscription/history")).length === 2);
    assert.ok(run.urls.every((url) => !url.includes("listed-mills-ipo")));
    const live = run.observations.find((item) => item.ipoId === "open-mills-ipo" && item.cadence === "live");
    assert.equal(live?.totalTimes, 12.5);
    assert.equal(live?.retailTimes, 0.8);
    assert.equal(live?.employeeTimes, 0);
    assert.equal(live?.anchorTimes, null);
    assert.equal(live?.observedAt?.toISOString(), "2026-09-01T13:01:00.000Z");
    assert.equal(live?.categories?.find((category) => category.key === "NII")?.subcategories.map((item) => item.key).join(","), "BNII,SNII");
    const daily = run.observations.filter((item) => item.ipoId === "open-mills-ipo" && item.cadence === "daily");
    assert.equal(daily.find((item) => item.observedOn === "2026-08-24")?.observedAt?.toISOString(), "2026-08-24T14:00:41.000Z");
    assert.equal(daily.find((item) => item.observedOn === "2026-08-26")?.observedAt, null);
    assert.equal(daily.find((item) => item.observedOn === "2026-08-26")?.totalTimes, 12.5);

    run.advance(59 * 60 * 1000);
    await runSyncTick(run.context);
    assert.equal(run.urls.length, 4);

    run.advance(60 * 1000);
    await runSyncTick(run.context);
    const again = run.urls.slice(4);
    assert.deepEqual(again, ["https://www.ipoguru.in/api/v2/ipos/open-mills-ipo/subscription"]);
  });

  it("stops at the tick budget before calling subscription history for every issue", async () => {
    const ipos = Array.from({ length: 10 }, (_item, index) => issue(`open-mills-${index}`, "open"));
    const run = harness({ ipos, maxCalls: 3 });
    const results = await runSyncTick(run.context);
    assert.equal(results.filter((item) => item.status === "succeeded").length, 3);
    assert.equal(run.urls.length, 3);
    assert.ok(run.urls.every((url) => url.endsWith("/subscription")));
  });

  it("keeps stored multiples when the provider fails and backs off a plan upgrade", async () => {
    const down = harness({ status: () => 503, body: () => JSON.stringify({ success: false, error: "upstream" }) });
    down.observations.push({
      ipoId: "open-mills-ipo",
      observedAt: new Date("2026-09-01T13:01:00.000Z"),
      observedOn: "2026-09-01",
      cadence: "live",
      retailTimes: 0.8,
      qibTimes: null,
      niiTimes: null,
      employeeTimes: 0,
      shareholderTimes: null,
      anchorTimes: null,
      categories: [],
      totalTimes: 12.5,
      source: {
        source: "IPO Guru Pro",
        fetchedAt: new Date("2026-09-01T12:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-09-01T13:01:00.000Z"),
        freshness: "fresh",
      },
      expiresAt: new Date("2027-10-27T00:00:00.000Z"),
    });
    const failed = await runSyncTick(down.context);
    assert.ok(failed.some((item) => item.status === "failed"));
    assert.equal(down.observations.find((item) => item.ipoId === "open-mills-ipo")?.totalTimes, 12.5);
    assert.ok(down.urls.length >= 3);
    assert.ok(down.urls.every((url) => url.includes("/subscription")));

    const upgrade = harness({ status: () => 402, body: () => JSON.stringify({ success: false, error: "plan_upgrade_required" }) });
    upgrade.observations.push(down.observations[0]!);
    const blocked = await runSyncTick(upgrade.context);
    assert.ok(blocked.some((item) => item.errorName === "PlanUpgradeError"));
    assert.equal(upgrade.observations.find((item) => item.ipoId === "open-mills-ipo")?.totalTimes, 12.5);
    const called = upgrade.urls.length;
    upgrade.advance(2 * 60 * 60 * 1000);
    await runSyncTick(upgrade.context);
    assert.equal(upgrade.urls.length, called);
    await assert.rejects(() => upgrade.client.readSubscription("../secret"), /IPO Guru request failed/);
    assert.equal(upgrade.urls.length, called);
  });
});
