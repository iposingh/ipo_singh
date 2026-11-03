import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStore } from "../cache/memory-store.ts";
import { createCacheService } from "../cache/service.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import { readConfig } from "../config/env.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import { defaultSyncPolicy } from "../config/sync-policy.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import type { CompanyRecord, IpoRecord, RegistrarRecord, SourceDocumentRecord, SyncRunRecord } from "../db/records.ts";
import { createSyncLock } from "./lock.ts";
import { runSyncTick, type SyncContext } from "./sync-service.ts";
import { createProviderGateway } from "../providers/gateway.ts";
import { createIpoGuruProvider } from "../providers/ipo-guru/adapter.ts";
import { createIpoGuruClient } from "../providers/ipo-guru/client.ts";
import type { IpoGuruTransport } from "../providers/ipo-guru/transport.ts";
import { createLogger } from "../shared/logger.ts";

const key = "test-key-value-0001";
const logger = createLogger({ level: "error", service: "detail-sync-test", sink: () => undefined });

function issue(slug: string, board: IpoRecord["board"]): IpoRecord {
  return {
    id: slug,
    slug,
    companyId: slug,
    board,
    status: "open",
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
    profile: {
      refundDate: null,
      dematCreditDate: null,
      about: "Stored overview",
      description: null,
      strengths: [],
      risks: [],
      promoters: [],
      objectsOfIssue: { items: [], text: null },
      sourceFinancials: { unit: null, headers: [], rows: [], text: "Stored prose" },
      cmpRupees: null,
      currentGainPercent: null,
    },
  };
}

function detailBody(input: { slug: string; type: "Mainboard" | "SME"; financials: unknown; registrar: unknown }): string {
  return JSON.stringify({
    success: true,
    plan: "pro",
    data: {
      slug: input.slug,
      name: input.slug,
      type: input.type,
      status: "Closed",
      is_listed: true,
      timeline: {
        open_date: "2026-08-24",
        close_date: "2026-08-27",
        allotment_date: "2026-08-28",
        refund_date: "2026-08-31",
        credit_to_demat_date: "2026-08-31",
        listing_date: "2026-09-01",
      },
      issue: { issue_size: "582.8", issue_price: "138", price_min: 131, price_max: 138, lot_size: 100, min_investment: 13800 },
      listing: { listing_price: "124", listing_gain_percent: -10.14, cmp: "126.46", current_gain_percent: -8.36 },
      company: {
        about: "Published overview",
        financials: input.financials,
        objects_of_issue: { items: ["Repayment of borrowings"] },
        promoters: ["Promoter Two"],
      },
      contacts: { registrar: input.registrar },
      documents: { rhp: "https://example.com/rhp.pdf", drhp: null },
    },
  });
}

function harness(input?: { status?: number; ipos?: IpoRecord[]; maxCalls?: number }) {
  const urls: string[] = [];
  let clock = new Date("2026-09-02T04:00:00.000Z");
  const ipos = input?.ipos ?? [issue("open-mills-ipo", "mainboard")];
  const companies: CompanyRecord[] = [];
  const registrars: RegistrarRecord[] = [];
  const sources: SourceDocumentRecord[] = [];
  const statements: string[] = [];
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
    const slug = request.url.split("/").at(-1) ?? "";
    const sme = slug.startsWith("sme-");
    return {
      status: input?.status ?? 200,
      headers: { "x-plan": "pro" },
      body: detailBody({
        slug,
        type: sme ? "SME" : "Mainboard",
        financials: sme
          ? { text: "Revenue rose during the reported years.", rows: [], headers: [] }
          : { headers: ["31 Mar 2026", "31 Mar 2025"], rows: [{ metric: "Assets", data: ["1,508.24", "1,321.64"] }], unit: "Rs. Crore" },
        registrar: sme
          ? { name: "Sample Registrar", slug: "sample-registrar", status_page: "https://registrar.example/allotment" }
          : { name: "Bigshare Services Private Limited", slug: "bigshare-services", status_page: "https://ipo.bigshareonline.com/ipo_status.html" },
      }),
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
    gmp: { upsert: unused, findByIpo: async () => [] },
    gmpWindows: { upsert: unused, findByIpo: async () => null },
    subscriptions: { upsert: unused, findByIpo: async () => [] },
    financials: {
      upsert: async () => {
        statements.push("written");
        throw new Error("Source rows must not become statement periods.");
      },
      findByCompany: async () => [],
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
        sources.push(record);
        return record;
      },
      findByIpo: async (ipoId) => sources.filter((item) => item.ipoId === ipoId),
    },
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
    loadIpoDetail: (slug) => client.readIssue(slug),
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
    ipos,
    statements,
    context,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

describe("IPO Guru detail sync", () => {
  it("fetches one issue document and keeps source Assets out of the statement table", async () => {
    const { urls, ipos, statements, context, advance } = harness();
    await runSyncTick(context);
    assert.deepEqual(urls, ["https://www.ipoguru.in/api/v2/ipos/open-mills-ipo"]);
    assert.equal(ipos[0]?.profile?.refundDate, "2026-08-31");
    assert.equal(ipos[0]?.profile?.dematCreditDate, "2026-08-31");
    assert.equal(ipos[0]?.profile?.sourceFinancials.rows[0]?.metric, "Assets");
    assert.equal(ipos[0]?.profile?.sourceFinancials.unit, "Rs. Crore");
    assert.equal(ipos[0]?.board, "mainboard");
    assert.equal(statements.length, 0);
    advance(60 * 60 * 1000);
    await runSyncTick(context);
    assert.equal(urls.length, 1);
  });

  it("keeps Mainboard and SME apart and drops an unofficial allotment link", async () => {
    const { urls, ipos, context } = harness({
      ipos: [issue("main-mills-ipo", "mainboard"), issue("sme-mills-ipo", "sme")],
    });
    await runSyncTick(context);
    assert.deepEqual(urls.map((url) => url.split("/").at(-1)), ["main-mills-ipo", "sme-mills-ipo"]);
    const main = ipos.find((item) => item.slug === "main-mills-ipo");
    const sme = ipos.find((item) => item.slug === "sme-mills-ipo");
    assert.equal(main?.board, "mainboard");
    assert.equal(main?.profile?.sourceFinancials.rows[0]?.metric, "Assets");
    assert.equal(sme?.board, "sme");
    assert.equal(sme?.profile?.sourceFinancials.text, "Revenue rose during the reported years.");
    assert.equal(sme?.profile?.sourceFinancials.rows.length, 0);
    const registrar = await context.store.registrars.findById("registrar-sme-mills-ipo");
    assert.equal(registrar?.allotmentUrl, null);
    const official = await context.store.registrars.findById("registrar-main-mills-ipo");
    assert.equal(official?.allotmentUrl, "https://ipo.bigshareonline.com/ipo_status.html");
  });

  it("leaves the stored overview in place when the detail read fails", async () => {
    const { urls, ipos, context } = harness({ status: 503 });
    await runSyncTick(context);
    assert.equal(urls.length, 1);
    assert.equal(ipos[0]?.profile?.about, "Stored overview");
    assert.equal(ipos[0]?.profile?.sourceFinancials.text, "Stored prose");
  });

  it("stops after the tick budget", async () => {
    const { urls, context } = harness({
      maxCalls: 1,
      ipos: [issue("main-mills-ipo", "mainboard"), issue("sme-mills-ipo", "sme")],
    });
    await runSyncTick(context);
    assert.deepEqual(urls, ["https://www.ipoguru.in/api/v2/ipos/main-mills-ipo"]);
  });
});
