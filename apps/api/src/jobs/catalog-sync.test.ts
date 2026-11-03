import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStore } from "../cache/memory-store.ts";
import { createCacheService } from "../cache/service.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import { readConfig } from "../config/env.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import { defaultSyncPolicy } from "../config/sync-policy.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import type { CompanyRecord, IpoRecord, SyncRunRecord } from "../db/records.ts";
import { createSyncLock } from "./lock.ts";
import { runSyncTick, type SyncContext } from "./sync-service.ts";
import { createProviderGateway } from "../providers/gateway.ts";
import { createIpoGuruProvider } from "../providers/ipo-guru/adapter.ts";
import { createIpoGuruClient } from "../providers/ipo-guru/client.ts";
import type { IpoGuruTransport } from "../providers/ipo-guru/transport.ts";
import { createLogger } from "../shared/logger.ts";

const key = "test-key-value-0001";
const logger = createLogger({ level: "error", service: "catalog-sync-test", sink: () => undefined });

function envelope(rows: readonly unknown[]): string {
  return JSON.stringify({ success: true, plan: "standard", count: rows.length, data: rows });
}

function issue(slug: string, type: "Mainboard" | "SME", status: string): Record<string, unknown> {
  return {
    slug,
    name: slug === "varmora-granito-ipo" ? "Varmora Granito" : "Sample SME Works",
    type,
    status,
    is_listed: false,
    open_date: "2026-09-22",
    close_date: "2026-09-24",
    allotment_date: "2026-09-25",
    listing_date: "2026-09-29",
    price_min: type === "Mainboard" ? 140 : null,
    price_max: type === "Mainboard" ? 148 : null,
    issue_price: type === "Mainboard" ? "148" : null,
    issue_size: type === "Mainboard" ? "708.02" : null,
    lot_size: type === "Mainboard" ? 101 : null,
    min_investment: type === "Mainboard" ? 14948 : null,
    gmp:
      type === "Mainboard"
        ? {
            price: "7.5",
            percentage: "5.07",
            estimated_listing_price: 155.5,
            updated_at: "2026-09-22T07:06:09.000000Z",
          }
        : { price: "0", percentage: null, estimated_listing_price: null, updated_at: "2026-09-22T07:06:09.000000Z" },
    subscription_total: type === "Mainboard" ? "0.07" : "",
    listing_price: null,
    listing_gain_percent: null,
  };
}

function storeOf(): { store: PersistenceStore; ipos: IpoRecord[]; companies: CompanyRecord[] } {
  const companies: CompanyRecord[] = [];
  const ipos: IpoRecord[] = [];
  const runs: SyncRunRecord[] = [];
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
        ipos.find((item) => item.providerMappings.some((mapping) => mapping.providerKey === providerKey && mapping.externalId === externalId)) ??
        null,
      list: async () => ipos,
    },
    gmp: {
      upsert: async (record) => ({ ...record, expiresAt: new Date("2027-01-01T00:00:00.000Z") }),
      findByIpo: async () => [],
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
  return { store, ipos, companies };
}

function harness(input: { body: () => string; status?: () => number; maxRetries?: number }) {
  const urls: string[] = [];
  let clock = new Date("2026-09-22T07:06:09.000Z");
  const transport: IpoGuruTransport = async (request) => {
    urls.push(request.url);
    assert.equal(request.url.includes(key), false);
    assert.equal(JSON.stringify(request.headers).includes(key), true);
    return {
      status: input.status?.() ?? 200,
      headers: { "x-plan": "standard" },
      body: input.body(),
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
    quotaPolicy: { ...defaultQuotaPolicy(), maxRetries: input.maxRetries ?? 0, backoffBaseMs: 1, backoffMaxMs: 1 },
    logger,
    transport,
    now: () => clock,
    sleep: async () => undefined,
  });
  const saved = storeOf();
  const provider = createIpoGuruProvider({ client, now: () => clock });
  const context: SyncContext = {
    providerKey: "ipo-guru",
    ipoGuruCatalog: true,
    gateway: createProviderGateway({
      primary: provider,
      now: () => clock,
      timeoutMs: 1_000,
      scheduleTimeout: () => () => undefined,
    }),
    quota: createQuota(),
    store: saved.store,
    cache: createCacheService({
      store: createMemoryStore(() => clock.getTime()),
      policy: defaultCachePolicy(),
      logger,
      now: () => clock,
    }),
    locks: createSyncLock(createMemoryStore(() => clock.getTime())),
    policy: defaultSyncPolicy(),
    now: () => clock,
    logger,
  };
  return {
    urls,
    saved,
    context,
    provider,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

function createQuota() {
  return {
    snapshot: async () => ({ minuteUsed: 0, dayUsed: 0 }),
    run: async <T>(load: () => Promise<T>) => load(),
  };
}

describe("IPO Guru catalogue sync", () => {
  it("stores both boards from one list request and does not call again inside the interval", async () => {
    const rows = [
      issue("varmora-granito-ipo", "Mainboard", "Open"),
      issue("sample-sme-ipo", "SME", "Upcoming"),
      { slug: "not-a-board", name: "Guessed Board", type: null, status: "Open" },
      issue("varmora-granito-ipo", "Mainboard", "Open"),
    ];
    const run = harness({ body: () => envelope(rows) });
    assert.equal(run.provider.capabilities.listIpos, "supported");
    assert.equal(run.provider.capabilities.currentGmp, "unverified");
    const first = await runSyncTick(run.context);
    assert.equal(first[0]?.status, "succeeded");
    assert.equal(run.urls.length, 1);
    assert.equal(run.urls[0], "https://www.ipoguru.in/api/v2/ipos?months=0");
    // Open date is the harness clock day (2026-09-22), so Upcoming → Open via resolveIpoLifecycle.
    // Persist order follows upsert completion, so compare as a sorted set.
    assert.deepEqual(
      run.saved.ipos
        .map((ipo) => [ipo.slug, ipo.board, ipo.status, ipo.providerMappings[0]?.externalId] as const)
        .sort((left, right) => left[0].localeCompare(right[0])),
      [
        ["sample-sme-ipo", "sme", "open", "sample-sme-ipo"],
        ["varmora-granito-ipo", "mainboard", "open", "varmora-granito-ipo"],
      ],
    );
    assert.equal(run.saved.ipos.find((ipo) => ipo.slug === "varmora-granito-ipo")?.issue.issueSizeRupees, 7_080_200_000);
    assert.equal(run.saved.ipos.find((ipo) => ipo.slug === "varmora-granito-ipo")?.issue.issuePriceRupees, 148);
    assert.equal(run.saved.companies.length, 2);
    const second = await runSyncTick(run.context);
    assert.deepEqual(second, []);
    assert.equal(run.urls.length, 1);

    run.advance(defaultSyncPolicy().catalogMs);
    const refreshed = await runSyncTick(run.context);
    assert.equal(refreshed[0]?.status, "succeeded");
    assert.equal(run.urls.length, 2);
    assert.equal(run.saved.ipos.length, 2);
    assert.equal(run.saved.companies.length, 2);
  });

  it("keeps stored issues when the provider is empty or unavailable", async () => {
    let mode: "ok" | "empty" | "down" = "ok";
    const run = harness({
      maxRetries: 1,
      status: () => (mode === "down" ? 503 : 200),
      body: () => (mode === "empty" ? envelope([]) : envelope([issue("varmora-granito-ipo", "Mainboard", "Open")])),
    });
    await runSyncTick(run.context);
    assert.equal(run.saved.ipos.length, 1);
    const size = run.saved.ipos[0]?.issue.issueSizeRupees;

    mode = "down";
    run.advance(defaultSyncPolicy().catalogMs);
    const failed = await runSyncTick(run.context);
    assert.equal(failed[0]?.status, "failed");
    assert.equal(run.urls.length, 3);
    assert.equal(run.saved.ipos.length, 1);
    assert.equal(run.saved.ipos[0]?.issue.issueSizeRupees, size);

    mode = "empty";
    run.advance(defaultSyncPolicy().catalogMs);
    const emptied = await runSyncTick(run.context);
    assert.equal(emptied[0]?.status, "succeeded");
    assert.equal(run.saved.ipos.length, 1);
    assert.equal(run.urls.at(-1)?.endsWith("/ipos?months=0"), true);
  });

  it("sends documented filters and does not send allotment upstream", async () => {
    const run = harness({
      body: () =>
        envelope([
          issue("varmora-granito-ipo", "Mainboard", "Closed"),
          issue("sample-sme-ipo", "SME", "Open"),
        ]),
    });
    const sme = await run.provider.listIpos({ board: "sme", status: "listed", limit: 5 });
    assert.equal(run.urls.at(-1), "https://www.ipoguru.in/api/v2/ipos?type=sme&status=listed&months=0&limit=5");
    assert.deepEqual(sme.records, []);

    await run.provider.listIpos({ q: "varmora" });
    assert.equal(run.urls.at(-1), "https://www.ipoguru.in/api/v2/ipos?search=varmora");

    run.advance(4 * 24 * 60 * 60 * 1000);
    const allotment = await run.provider.listIpos({ status: "allotment" });
    assert.equal(run.urls.at(-1)?.includes("status="), false);
    assert.equal(run.urls.at(-1)?.includes("months=0"), true);
    // Both issues share close/allotment dates; after +4 days both resolve into the allotment window.
    assert.deepEqual(
      (allotment.records ?? []).map((record) => (record as { slug: string }).slug).sort(),
      ["sample-sme-ipo", "varmora-granito-ipo"],
    );
  });
});
