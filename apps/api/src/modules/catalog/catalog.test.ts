import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  apiErrorSchema,
  financialsResponseSchema,
  gmpHistoryResponseSchema,
  gmpResponseSchema,
  ipoSchema,
  pageSchema,
  registrarResponseSchema,
  subscriptionHistoryResponseSchema,
  subscriptionResponseSchema,
  calendarEntrySchema,
  ipoSummarySchema,
} from "@ipo-singh/contracts";
import { createMemoryStore } from "../../cache/memory-store.ts";
import { createCacheService } from "../../cache/service.ts";
import type { CacheHandle } from "../../cache/connection.ts";
import { defaultCachePolicy } from "../../config/cache-policy.ts";
import type { AppConfig } from "../../config/env.ts";
import { defaultHttpLimits } from "../../config/http-limits.ts";
import { defaultQuotaPolicy } from "../../config/quota.ts";
import { disabledIpoGuruConfig } from "../../config/ipoguru.ts";
import type { DatabaseHandle } from "../../db/handle.ts";
import type {
  CompanyRecord,
  FinancialStatementRecord,
  GmpObservationRecord,
  IpoRecord,
  RegistrarRecord,
  SourceMetadataRecord,
  SubscriptionObservationRecord,
} from "../../db/records.ts";
import type { PersistenceStore } from "../../db/repositories.ts";
import { startServer, type RunningServer } from "../../index.ts";
import { createLogger } from "../../shared/logger.ts";
import { CursorError, decodeCursor, encodeCursor, pageOf } from "./query.ts";

const fetchedAt = new Date("2026-10-18T04:30:00.000Z");

function source(freshness: SourceMetadataRecord["freshness"] = "fresh"): SourceMetadataRecord {
  return { source: "fixture", fetchedAt, sourceUpdatedAt: null, freshness };
}

function company(id: string, name: string, symbol: string | null = null): CompanyRecord {
  return { id, name, symbol, source: source() };
}

function ipo(input: {
  id: string;
  companyId: string;
  board: IpoRecord["board"];
  status: IpoRecord["status"];
  dates: IpoRecord["dates"];
  registrarId?: string | null;
}): IpoRecord {
  return {
    id: input.id,
    slug: input.id,
    companyId: input.companyId,
    board: input.board,
    status: input.status,
    issue: {
      priceBandLowRupees: 100,
      priceBandHighRupees: 120,
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: 0,
      minimumInvestmentRupees: null,
    },
    dates: input.dates,
    listing: null,
    registrarId: input.registrarId ?? null,
    providerMappings: [],
    source: source(),
  };
}

const companies = [
  company("fixture-polymers", "Fixture Polymers", "FXPOLY"),
  company("fixture-alloys", "Fixture Alloys", null),
  company("fixture-blank", "Fixture Blank", null),
];

const ipos = [
  ipo({
    id: "fixture-polymers",
    companyId: "fixture-polymers",
    board: "mainboard",
    status: "open",
    dates: { openDate: "2026-10-20", closeDate: "2026-10-22", allotmentDate: null, listingDate: null },
    registrarId: "fixture-registrar",
  }),
  ipo({
    id: "fixture-alloys",
    companyId: "fixture-alloys",
    board: "sme",
    status: "allotment",
    dates: { openDate: "2026-09-01", closeDate: "2026-09-03", allotmentDate: "2026-09-08", listingDate: "2026-09-10" },
  }),
  ipo({
    id: "fixture-blank",
    companyId: "fixture-blank",
    board: "mainboard",
    status: null,
    dates: { openDate: null, closeDate: null, allotmentDate: null, listingDate: null },
  }),
];

const gmpRows: GmpObservationRecord[] = [
  {
    ipoId: "fixture-polymers",
    observedAt: new Date("2026-10-17T04:30:00.000Z"),
    session: "daily",
    amountRupees: null,
    percent: null,
    indicativeImpliedPriceRupees: null,
    source: source("stale"),
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  },
  {
    ipoId: "fixture-polymers",
    observedAt: new Date("2026-10-18T04:30:00.000Z"),
    session: "daily",
    amountRupees: 0,
    percent: null,
    indicativeImpliedPriceRupees: null,
    source: source("fresh"),
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  },
];

const subscriptionRows: SubscriptionObservationRecord[] = [
  {
    ipoId: "fixture-alloys",
    observedAt: fetchedAt,
    retailTimes: 0,
    qibTimes: null,
    niiTimes: null,
    employeeTimes: null,
    totalTimes: 0,
    source: source("fresh"),
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  },
];

const financials: FinancialStatementRecord[] = [
  {
    companyId: "fixture-polymers",
    fiscalYearLabel: "FY26",
    revenueRupees: 0,
    profitAfterTaxRupees: null,
    earningsPerShareRupees: null,
    source: source("fresh"),
  },
];

const registrars: RegistrarRecord[] = [
  {
    id: "fixture-registrar",
    name: "Fixture Registrar",
    websiteUrl: "https://registrar.example/fixture",
    allotmentUrl: null,
    source: source("fresh"),
  },
];

function unused(): never {
  throw new Error("Unexpected catalogue store call.");
}

function fixtureStore(counts: { list: number; gmp: number; slug: number }, rows = ipos): PersistenceStore {
  return {
    companies: {
      upsert: unused,
      findByName: unused,
      async findById(id) {
        return companies.find((item) => item.id === id) ?? null;
      },
      async list() {
        counts.list += 1;
        return companies;
      },
    },
    ipos: {
      upsert: unused,
      findById: unused,
      findByProvider: unused,
      async findBySlug(slug) {
        counts.slug += 1;
        return rows.find((item) => item.slug === slug) ?? null;
      },
      async list() {
        counts.list += 1;
        return rows;
      },
    },
    gmp: {
      upsert: unused,
      async findByIpo(ipoId) {
        counts.gmp += 1;
        return gmpRows.filter((item) => item.ipoId === ipoId);
      },
    },
    subscriptions: {
      upsert: unused,
      async findByIpo(ipoId) {
        return subscriptionRows.filter((item) => item.ipoId === ipoId);
      },
    },
    financials: {
      upsert: unused,
      async findByCompany(companyId) {
        return financials.filter((item) => item.companyId === companyId);
      },
    },
    registrars: {
      upsert: unused,
      async findById(id) {
        return registrars.find((item) => item.id === id) ?? null;
      },
    },
    sources: {
      upsert: unused,
      async findByIpo() {
        return [];
      },
    },
    sync: { upsert: unused, findByProvider: unused },
    usage: { upsert: unused, findByProvider: unused },
  };
}

function config(): AppConfig {
  return {
    nodeEnv: "test",
    deployment: "test",
    host: "127.0.0.1",
    port: 0,
    corsOrigins: ["http://localhost:3000"],
    logLevel: "error",
    requestBodyLimit: "1kb",
    shutdownTimeoutMs: 1000,
    ...defaultHttpLimits(),
    trustProxy: false,
    serviceName: "ipo-singh-api",
    version: "0.1.0",
    mongodb: null,
    redis: null,
    cache: defaultCachePolicy(),
    quota: defaultQuotaPolicy(),
    provider: null,
    ipoGuru: disabledIpoGuruConfig(),
    internalServiceToken: null,
    opsToken: null,
  };
}

function cacheHandle(gated: { count: number }): CacheHandle {
  const logger = createLogger({ level: "error", service: "test", sink: () => undefined });
  const policy = defaultCachePolicy();
  return {
    async check() {
      return "ok";
    },
    store: null,
    policy,
    service: createCacheService({
      store: createMemoryStore(),
      policy,
      logger,
      originGate: async (load) => {
        gated.count += 1;
        return load();
      },
    }),
    quota: {
      async run(load) {
        gated.count += 1;
        return load();
      },
      async snapshot() {
        return { minuteUsed: gated.count, dayUsed: gated.count };
      },
    },
    async close() {
      return undefined;
    },
  };
}

function database(store: PersistenceStore, check: DatabaseHandle["check"] = async () => "ok"): DatabaseHandle {
  return { check, close: async () => undefined, store };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

describe("public IPO catalogue", () => {
  it("rejects a malformed cursor and keeps an unknown total pageable", () => {
    assert.throws(() => decodeCursor("not-a-cursor"), CursorError);
    assert.throws(() => decodeCursor(encodeCursor(2_001)), CursorError);
    assert.equal(decodeCursor(encodeCursor(2_000)), 2_000);
    const page = pageOf(["first", "second"], 0, 1, true);
    assert.equal(page.page.totalCount, null);
    assert.equal(page.page.nextCursor, encodeCursor(1));
    assert.deepEqual(pageOf(["only"], 0, 20, false), {
      items: ["only"],
      page: { limit: 20, nextCursor: null, totalCount: 1 },
    });
  });

  describe("stored fixtures", () => {
    const counts = { list: 0, gmp: 0, slug: 0 };
    const gated = { count: 0 };
    let running: RunningServer;

    before(async () => {
      const { setCatalogNow } = await import("./present.ts");
      setCatalogNow(() => new Date("2026-10-21T06:00:00.000Z"));
      const logger = createLogger({ level: "error", service: "test", sink: () => undefined });
      running = await startServer(config(), logger, database(fixtureStore(counts)), cacheHandle(gated));
    });

    after(async () => {
      const { resetCatalogNow } = await import("./present.ts");
      resetCatalogNow();
      await running.shutdown();
    });

    it("filters, sorts, and pages stored IPOs without inventing missing values", async () => {
      const listed = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/ipos"));
      assert.deepEqual(
        listed.items.map((item) => item.slug),
        ["fixture-alloys", "fixture-polymers", "fixture-blank"],
      );
      assert.equal(listed.page.totalCount, 3);
      assert.equal(listed.items[2]?.openDate, null);
      assert.equal(listed.items[1]?.gmpAmountRupees, 0);
      assert.equal(listed.items[0]?.gmpAmountRupees, null);
      assert.equal(listed.items[0]?.subscriptionTotalTimes, 0);
      assert.equal(listed.items[1]?.subscriptionTotalTimes, null);
      assert.equal(listed.items.find((item) => item.slug === "fixture-polymers")?.registrarName, "Fixture Registrar");
      assert.equal(listed.items.find((item) => item.slug === "fixture-alloys")?.registrarName, null);
      assert.equal(listed.items.find((item) => item.slug === "fixture-polymers")?.allotmentConfirmed, undefined);

      const sme = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/ipos?board=sme"));
      assert.deepEqual(sme.items.map((item) => item.slug), ["fixture-alloys"]);

      const closed = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/ipos?status=closed"));
      assert.deepEqual(closed.items.map((item) => item.slug), ["fixture-alloys"]);

      const open = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/ipos?status=open"));
      assert.deepEqual(open.items.map((item) => item.slug), ["fixture-polymers"]);

      const listedStatus = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/ipos?status=listed"));
      assert.equal(listedStatus.page.totalCount, 0);
      assert.deepEqual(listedStatus.items, []);

      const newestClose = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/ipos?sort=close&direction=desc"));
      assert.deepEqual(
        newestClose.items.map((item) => item.slug),
        ["fixture-polymers", "fixture-alloys", "fixture-blank"],
      );

      const first = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/ipos?limit=1"));
      assert.equal(first.items[0]?.slug, "fixture-alloys");
      assert.ok(first.page.nextCursor);
      const second = pageSchema(ipoSummarySchema).parse(await json(running, `/api/v1/ipos?limit=1&cursor=${first.page.nextCursor}`));
      assert.equal(second.items[0]?.slug, "fixture-polymers");
      const third = pageSchema(ipoSummarySchema).parse(await json(running, `/api/v1/ipos?limit=1&cursor=${second.page.nextCursor}`));
      assert.equal(third.items[0]?.slug, "fixture-blank");
      assert.equal(third.page.nextCursor, null);
    });

    it("searches by company name and trading symbol", async () => {
      const bySymbol = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/search?q=fxpoly"));
      assert.deepEqual(bySymbol.items.map((item) => item.slug), ["fixture-polymers"]);
      const byName = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/search?q=Fixture%20Alloys"));
      assert.deepEqual(byName.items.map((item) => item.slug), ["fixture-alloys"]);
      const bySlug = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/search?q=fixture-blank"));
      assert.deepEqual(bySlug.items.map((item) => item.slug), ["fixture-blank"]);
      const byPartialName = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/search?q=poly"));
      assert.deepEqual(byPartialName.items.map((item) => item.slug), ["fixture-polymers"]);
      const byPartialSymbol = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/search?q=fx"));
      assert.deepEqual(byPartialSymbol.items.map((item) => item.slug), ["fixture-polymers"]);
      const empty = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/search?q=missing"));
      assert.equal(empty.page.totalCount, 0);
      assert.equal(Object.hasOwn(bySymbol.items[0] ?? {}, "symbol"), false);

      const october = pageSchema(ipoSummarySchema).parse(
        await json(running, "/api/v1/search?q=fixture&from=2026-10-01&to=2026-10-31"),
      );
      assert.deepEqual(october.items.map((item) => item.slug), ["fixture-polymers"]);
      const listingDay = pageSchema(ipoSummarySchema).parse(
        await json(running, "/api/v1/search?q=fixture&from=2026-09-10&to=2026-09-10"),
      );
      assert.deepEqual(listingDay.items.map((item) => item.slug), ["fixture-alloys"]);
      const allotmentDay = pageSchema(ipoSummarySchema).parse(
        await json(running, "/api/v1/search?q=fixture&from=2026-09-08&to=2026-09-08"),
      );
      assert.deepEqual(allotmentDay.items.map((item) => item.slug), []);
      const openMainboard = pageSchema(ipoSummarySchema).parse(
        await json(running, "/api/v1/search?q=fixture&status=open&board=mainboard"),
      );
      assert.deepEqual(openMainboard.items.map((item) => item.slug), ["fixture-polymers"]);
      const closed = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/search?q=fixture&status=closed"));
      assert.deepEqual(closed.items.map((item) => item.slug), ["fixture-alloys"]);
      const year = pageSchema(ipoSummarySchema).parse(
        await json(running, "/api/v1/search?q=fixture&from=2026-01-01&to=2026-12-31"),
      );
      assert.deepEqual(year.items.map((item) => item.slug), ["fixture-alloys", "fixture-polymers"]);
    });

    it("builds a calendar from stored dates only", async () => {
      const calendar = pageSchema(calendarEntrySchema).parse(await json(running, "/api/v1/calendar"));
      assert.deepEqual(
        calendar.items.map((item) => `${item.date}:${item.event}:${item.ipo.slug}`),
        [
          "2026-09-01:open:fixture-alloys",
          "2026-09-03:close:fixture-alloys",
          "2026-09-08:allotment:fixture-alloys",
          "2026-09-10:listing:fixture-alloys",
          "2026-10-20:open:fixture-polymers",
          "2026-10-22:close:fixture-polymers",
        ],
      );
      const october = pageSchema(calendarEntrySchema).parse(await json(running, "/api/v1/calendar?from=2026-10-01&to=2026-10-31"));
      assert.equal(october.items.length, 2);
      assert.equal(october.items.every((item) => item.ipo.slug === "fixture-polymers"), true);
    });

    it("keeps missing GMP and subscription distinct from zero", async () => {
      const current = gmpResponseSchema.parse(await json(running, "/api/v1/ipos/fixture-polymers/gmp"));
      assert.equal(current.gmp?.amountRupees, 0);
      assert.equal(current.gmp?.percent, null);
      assert.equal(current.gmp?.indicativeImpliedPriceRupees, null);
      assert.equal(current.provenance.freshness, "fresh");

      const missing = gmpResponseSchema.parse(await json(running, "/api/v1/ipos/fixture-alloys/gmp"));
      assert.equal(missing.gmp, null);
      assert.equal(missing.provenance.freshness, "missing");

      const history = gmpHistoryResponseSchema.parse(await json(running, "/api/v1/ipos/fixture-polymers/gmp/history"));
      assert.deepEqual(
        history.observations.map((item) => item.amountRupees),
        [null, 0],
      );

      const subscription = subscriptionResponseSchema.parse(await json(running, "/api/v1/ipos/fixture-polymers/subscription"));
      assert.equal(subscription.subscription, null);
      const zero = subscriptionResponseSchema.parse(await json(running, "/api/v1/ipos/fixture-alloys/subscription"));
      assert.equal(zero.subscription?.totalTimes, 0);
      assert.equal(zero.subscription?.qibTimes, null);

      const subscriptionHistory = subscriptionHistoryResponseSchema.parse(
        await json(running, "/api/v1/ipos/fixture-alloys/subscription/history"),
      );
      assert.equal(subscriptionHistory.observations[0]?.totalTimes, 0);

      const statements = financialsResponseSchema.parse(await json(running, "/api/v1/ipos/fixture-polymers/financials"));
      assert.equal(statements.periods[0]?.revenueRupees, 0);
      assert.equal(statements.periods[0]?.profitAfterTaxRupees, null);
      const noStatements = financialsResponseSchema.parse(await json(running, "/api/v1/ipos/fixture-blank/financials"));
      assert.deepEqual(noStatements.periods, []);
      assert.equal(noStatements.provenance.freshness, "missing");

      const registrar = registrarResponseSchema.parse(await json(running, "/api/v1/ipos/fixture-polymers/registrar"));
      assert.equal(registrar.registrar?.name, "Fixture Registrar");
      assert.equal(registrar.verification, "verify-before-use");
      const noRegistrar = registrarResponseSchema.parse(await json(running, "/api/v1/ipos/fixture-alloys/registrar"));
      assert.equal(noRegistrar.registrar, null);
      assert.equal(noRegistrar.verification, "verify-before-use");

      const detail = ipoSchema.parse(await json(running, "/api/v1/ipos/fixture-polymers"));
      assert.equal(detail.companyName, "Fixture Polymers");
      assert.equal(detail.gmp?.amountRupees, 0);
      assert.equal(detail.subscription, null);
      assert.equal(detail.offer.lotSizeShares, 0);
    });

    it("validates queries and unknown slugs", async () => {
      const limit = await fetch(`${running.url}/api/v1/ipos?limit=101`, { headers: { connection: "close" } });
      assert.equal(limit.status, 400);
      assert.equal(apiErrorSchema.parse(await readJson(limit)).code, "validation_error");

      const board = await fetch(`${running.url}/api/v1/ipos?board=neither`, { headers: { connection: "close" } });
      assert.equal(board.status, 400);
      const cursor = await fetch(`${running.url}/api/v1/ipos?cursor=not-a-cursor`, { headers: { connection: "close" } });
      assert.equal(cursor.status, 400);
      assert.equal(apiErrorSchema.parse(await readJson(cursor)).fieldErrors?.[0]?.field, "cursor");
      const search = await fetch(`${running.url}/api/v1/search`, { headers: { connection: "close" } });
      assert.equal(search.status, 400);
      const searchLimit = await fetch(`${running.url}/api/v1/search?q=fixture&limit=21`, { headers: { connection: "close" } });
      assert.equal(searchLimit.status, 400);
      const searchRange = await fetch(`${running.url}/api/v1/search?q=fixture&from=2026-10-22&to=2026-10-01`, { headers: { connection: "close" } });
      assert.equal(searchRange.status, 400);
      const searchDate = await fetch(`${running.url}/api/v1/search?q=fixture&from=2026-02-31`, { headers: { connection: "close" } });
      assert.equal(searchDate.status, 400);
      const listFrom = await fetch(`${running.url}/api/v1/ipos?from=2026-10-01`, { headers: { connection: "close" } });
      assert.equal(listFrom.status, 400);
      const range = await fetch(`${running.url}/api/v1/calendar?from=2026-10-22&to=2026-10-01`, { headers: { connection: "close" } });
      assert.equal(range.status, 400);
      const secret = await fetch(`${running.url}/api/v1/ipos?apiKey=hidden`, { headers: { connection: "close" } });
      assert.equal(secret.status, 400);

      const missing = await fetch(`${running.url}/api/v1/ipos/not-a-real-issue`, { headers: { connection: "close" } });
      assert.equal(missing.status, 404);
      assert.equal(apiErrorSchema.parse(await readJson(missing)).code, "not_found");
      const slug = await fetch(`${running.url}/api/v1/ipos/NOT-VALID`, { headers: { connection: "close" } });
      assert.equal(slug.status, 400);

      for (const path of ["/api/v1/gmp", "/api/v1/subscriptions", "/api/v1/auth"]) {
        const response = await fetch(`${running.url}${path}`, { headers: { connection: "close" } });
        assert.equal(response.status, 404);
        await response.arrayBuffer();
      }
    });

    it("serves a second read from cache and does not meter it as a provider call", async () => {
      const beforeList = counts.list;
      const beforeGmp = counts.gmp;
      const beforeGate = gated.count;
      const first = await fetch(`${running.url}/api/v1/ipos`, { headers: { connection: "close" } });
      assert.equal(first.headers.get("cache-control"), "no-store");
      await first.arrayBuffer();
      const second = await fetch(`${running.url}/api/v1/ipos`, { headers: { connection: "close" } });
      await second.arrayBuffer();
      assert.equal(counts.list, beforeList);
      const gmp = await fetch(`${running.url}/api/v1/ipos/fixture-polymers/gmp`, { headers: { connection: "close" } });
      await gmp.arrayBuffer();
      const gmpAgain = await fetch(`${running.url}/api/v1/ipos/fixture-polymers/gmp`, { headers: { connection: "close" } });
      await gmpAgain.arrayBuffer();
      assert.equal(counts.gmp, beforeGmp);
      assert.equal(gated.count, beforeGate);
      assert.equal(gated.count, 0);
    });
  });

  it("returns an empty page when the store has no IPOs", async () => {
    const logger = createLogger({ level: "error", service: "test", sink: () => undefined });
    const running = await startServer(config(), logger, database(fixtureStore({ list: 0, gmp: 0, slug: 0 }, [])), cacheHandle({ count: 0 }));
    try {
      const page = pageSchema(ipoSummarySchema).parse(await json(running, "/api/v1/ipos"));
      assert.deepEqual(page.items, []);
      assert.equal(page.page.totalCount, 0);
      assert.equal(page.page.nextCursor, null);
      const missing = await fetch(`${running.url}/api/v1/ipos/fixture-polymers`, { headers: { connection: "close" } });
      assert.equal(missing.status, 404);
      await missing.arrayBuffer();
    } finally {
      await running.shutdown();
    }
  });

  it("reports an unavailable database instead of an empty catalogue", async () => {
    const counts = { list: 0, gmp: 0, slug: 0 };
    const logger = createLogger({ level: "error", service: "test", sink: () => undefined });
    const running = await startServer(
      config(),
      logger,
      database(fixtureStore(counts), async () => "unavailable"),
      cacheHandle({ count: 0 }),
    );
    try {
      const response = await fetch(`${running.url}/api/v1/ipos`, { headers: { connection: "close" } });
      assert.equal(response.status, 503);
      assert.equal(apiErrorSchema.parse(await readJson(response)).code, "unavailable");
      assert.equal(counts.list, 0);
    } finally {
      await running.shutdown();
    }
  });

  it("does not hide a stored IPO whose company record is missing", async () => {
    const logger = createLogger({ level: "error", service: "test", sink: () => undefined });
    const running = await startServer(
      config(),
      logger,
      database(fixtureStore({ list: 0, gmp: 0, slug: 0 }, [ipos[2]!].map((row) => ({ ...row, companyId: "missing-company" })))),
      cacheHandle({ count: 0 }),
    );
    try {
      const response = await fetch(`${running.url}/api/v1/ipos`, { headers: { connection: "close" } });
      assert.equal(response.status, 503);
      assert.equal(apiErrorSchema.parse(await readJson(response)).message, "A stored IPO is missing its company record.");
    } finally {
      await running.shutdown();
    }
  });
});

async function json(running: RunningServer, path: string): Promise<unknown> {
  const response = await fetch(`${running.url}${path}`, { headers: { connection: "close" } });
  const body = await readJson(response);
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}
