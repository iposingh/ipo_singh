import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { after, before, describe, it } from "node:test";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import type { AppConfig } from "../config/env.ts";
import { defaultHttpLimits } from "../config/http-limits.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import { disabledIpoGuruConfig } from "../config/ipoguru.ts";
import { startServer } from "../index.ts";
import { readyResponseSchema } from "../modules/health/schema.ts";
import { ConfigError } from "../shared/errors.ts";
import { createLogger } from "../shared/logger.ts";
import { connectDatabase, type ConnectedDatabase } from "./connection.ts";
import { CompanyModel } from "./models/company.ts";
import { GmpObservationModel } from "./models/gmp-observation.ts";
import { IpoModel } from "./models/ipo.ts";
import { parseMongoTarget } from "./mongo-target.ts";
import { PersistenceError } from "./persistence-error.ts";
import { createMongoStore } from "./mongo-store.ts";
import type { RetentionPolicy } from "./retention.ts";
import type { CompanyRecord, IpoRecord, SourceMetadataRecord } from "./records.ts";

const secret = "super-secret-value";
const quiet = createLogger({ level: "error", service: "test", sink: () => undefined });
const retention: RetentionPolicy = {
  gmpDays: 400,
  subscriptionDays: 400,
  syncHistoryDays: 90,
  providerUsageDays: 90,
};

function mongoConfig(uri: string, database: string, host: string, timeouts = 5000): AppConfig {
  return {
    nodeEnv: "test",
    deployment: "test",
    host: "127.0.0.1",
    port: 0,
    corsOrigins: [],
    logLevel: "error",
    requestBodyLimit: "1kb",
    shutdownTimeoutMs: 1000,
    ...defaultHttpLimits(),
    trustProxy: false,
    serviceName: "ipo-singh-api",
    version: "0.1.0",
    mongodb: {
      uri,
      host,
      database,
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMs: timeouts,
      connectTimeoutMs: timeouts,
      socketTimeoutMs: timeouts,
      retention,
    },
    redis: null,
    cache: defaultCachePolicy(),
    quota: defaultQuotaPolicy(),
    provider: null,
    ipoGuru: disabledIpoGuruConfig(),
    internalServiceToken: null,
    opsToken: null,
  };
}

function source(fetchedAt: Date): SourceMetadataRecord {
  return { source: "fixture", fetchedAt, sourceUpdatedAt: null, freshness: "missing" };
}

function company(id = "fixture-mills"): CompanyRecord {
  return { id, name: "Fixture Mills", source: source(new Date("2026-01-01T00:00:00.000Z")) };
}

function ipo(id = "fixture-mills-sme"): IpoRecord {
  return {
    id,
    slug: id,
    companyId: "fixture-mills",
    board: "sme",
    status: null,
    issue: {
      priceBandLowRupees: null,
      priceBandHighRupees: null,
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: 0,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: null, closeDate: null, allotmentDate: null, listingDate: null },
    listing: null,
    registrarId: null,
    providerMappings: [{ providerKey: "fixture-provider", externalId: "ext-fixture-1" }],
    source: source(new Date("2026-01-01T00:00:00.000Z")),
  };
}

type IndexInfo = { key?: Record<string, number>; unique?: boolean; expireAfterSeconds?: number };

function hasIndex(indexes: IndexInfo[], key: Record<string, number>, expected?: { unique?: boolean; expireAfterSeconds?: number }): boolean {
  return indexes.some((index) => {
    if (JSON.stringify(index.key) !== JSON.stringify(key)) return false;
    if (expected?.unique !== undefined && Boolean(index.unique) !== expected.unique) return false;
    if (expected?.expireAfterSeconds !== undefined && index.expireAfterSeconds !== expected.expireAfterSeconds) return false;
    return true;
  });
}

describe("MongoDB persistence", { concurrency: 1, timeout: 180_000 }, () => {
  it("does not connect when the module is loaded", () => {
    assert.equal(mongoose.connection.readyState, 0);
  });

  it("refuses a production database name before opening a connection", async () => {
    await assert.rejects(
      () => connectDatabase(mongoConfig("mongodb://127.0.0.1:27017/ipo-singh", "ipo-singh", "127.0.0.1:27017"), quiet),
      (error: unknown) => error instanceof ConfigError,
    );
    assert.equal(mongoose.connection.readyState, 0);
  });

  it("hides credentials when a connection fails", async () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "info", service: "test", sink: (line) => lines.push(line) });
    const uri = `mongodb://app-user:${secret}@127.0.0.1:1/ipo-singh-test`;
    try {
      await connectDatabase(mongoConfig(uri, "ipo-singh-test", "127.0.0.1:1", 400), logger);
      assert.fail("expected the connection to fail");
    } catch (error) {
      assert.ok(error instanceof PersistenceError);
      assert.equal(String(error).includes(secret), false);
    } finally {
      await mongoose.disconnect();
    }
    assert.equal(lines.join("\n").includes(secret), false);
    assert.equal(mongoose.connection.readyState, 0);
  });

  describe("disposable database", () => {
    let memory: MongoMemoryServer;
    let connected: ConnectedDatabase;

    before(async () => {
      memory = await MongoMemoryServer.create({ instance: { dbName: "ipo-singh-test" } });
      const base = memory.getUri().replace(/\/$/, "");
      const uri = base.endsWith("ipo-singh-test") ? base : `${base}/ipo-singh-test`;
      const target = parseMongoTarget(uri);
      assert.ok(target);
      assert.equal(target.database, "ipo-singh-test");
      assert.notEqual(uri, process.env.MONGODB_URI);
      connected = await connectDatabase(mongoConfig(uri, target.database, target.host), quiet);
    });

    after(async () => {
      await connected?.close();
      await memory?.stop();
    });

    it("pings the disposable database and keeps catalogue writes idempotent", async () => {
      assert.equal(await connected.check(), "ok");
      assert.equal(mongoose.connection.getClient().options.maxPoolSize, 5);

      const savedCompany = await connected.store.companies.upsert(company());
      await connected.store.companies.upsert({ ...savedCompany, name: "Fixture Mills Updated" });
      assert.equal(await CompanyModel.countDocuments({ _id: "fixture-mills" }), 1);
      assert.equal((await connected.store.companies.findById("fixture-mills"))?.name, "Fixture Mills Updated");
      assert.equal((await connected.store.companies.findByName("Fixture Mills Updated"))?.id, "fixture-mills");

      const savedIpo = await connected.store.ipos.upsert(ipo());
      assert.equal(savedIpo.issue.lotSizeShares, 0);
      assert.equal(savedIpo.issue.issuePriceRupees, null);
      assert.equal(savedIpo.status, null);
      await connected.store.ipos.upsert({ ...savedIpo, status: "upcoming" });
      assert.equal(await IpoModel.countDocuments({ _id: "fixture-mills-sme" }), 1);
      assert.equal((await connected.store.ipos.findBySlug("fixture-mills-sme"))?.status, "upcoming");
      assert.equal((await connected.store.ipos.findByProvider("fixture-provider", "ext-fixture-1"))?.id, "fixture-mills-sme");

      await assert.rejects(
        () => connected.store.ipos.upsert({ ...ipo("fixture-other"), slug: "fixture-other" }),
        (error: unknown) => error instanceof PersistenceError && error.message === "A record with this identifier already exists.",
      );
    });

    it("rejects raw provider payloads before they are stored", async () => {
      const input = { ...company("fixture-raw"), raw: { body: secret } };
      await assert.rejects(() => connected.store.companies.upsert(input as CompanyRecord));
      assert.equal(await CompanyModel.countDocuments({ _id: "fixture-raw" }), 0);
      const stored = await CompanyModel.findById("fixture-mills").lean();
      assert.equal(JSON.stringify(stored).includes(secret), false);
      assert.equal(stored && "raw" in stored, false);
    });

    it("upserts observations once and hides expired rows", async () => {
      const observedAt = new Date("2026-01-02T03:30:00.000Z");
      const fetchedAt = new Date("2026-01-02T03:30:00.000Z");
      const first = await connected.store.gmp.upsert({
        ipoId: "fixture-mills-sme",
        observedAt,
        session: "daily",
        amountRupees: 0,
        percent: null,
        indicativeImpliedPriceRupees: null,
        source: source(fetchedAt),
      });
      assert.equal(first.amountRupees, 0);
      assert.equal(first.percent, null);
      const { expiresAt: _gmpExpiry, ...gmpWrite } = first;
      await connected.store.gmp.upsert({ ...gmpWrite, amountRupees: null, percent: 0 });
      assert.equal(await GmpObservationModel.countDocuments({ ipoId: "fixture-mills-sme", session: "daily" }), 1);
      const visible = await connected.store.gmp.findByIpo("fixture-mills-sme");
      assert.equal(visible.length, 1);
      assert.equal(visible[0]?.amountRupees, null);
      assert.equal(visible[0]?.percent, 0);
      assert.equal(visible[0]?.observedOn ?? null, null);
      assert.equal(visible[0]?.slotLabel ?? null, null);
      assert.ok(connected.store.gmpWindows);
      const savedWindow = await connected.store.gmpWindows.upsert({
        ipoId: "fixture-mills-sme",
        highRupees: 0,
        highOn: "2026-08-29",
        lowRupees: -15,
        lowOn: "2026-08-31",
        truncated: true,
        timelineLocked: false,
        source: source(fetchedAt),
      });
      assert.equal(savedWindow.highRupees, 0);
      assert.equal(savedWindow.lowRupees, -15);
      await connected.store.gmpWindows.upsert({ ...savedWindow, truncated: false });
      const storedWindow = await connected.store.gmpWindows.findByIpo("fixture-mills-sme");
      assert.equal(storedWindow?.truncated, false);
      assert.equal(storedWindow?.highOn, "2026-08-29");

      const short = createMongoStore({ ...retention, gmpDays: 1, subscriptionDays: 1, syncHistoryDays: 1, providerUsageDays: 1 });
      const expired = await short.gmp.upsert({
        ipoId: "fixture-expired",
        observedAt,
        session: "intraday",
        amountRupees: null,
        percent: null,
        indicativeImpliedPriceRupees: null,
        source: source(new Date("2020-01-01T00:00:00.000Z")),
      });
      assert.ok(expired.expiresAt.getTime() < Date.now());
      assert.deepEqual(await short.gmp.findByIpo("fixture-expired"), []);

      const subscription = await connected.store.subscriptions.upsert({
        ipoId: "fixture-mills-sme",
        observedAt,
        retailTimes: 0,
        qibTimes: null,
        niiTimes: null,
        employeeTimes: null,
        totalTimes: null,
        source: source(fetchedAt),
      });
      const { expiresAt: _subscriptionExpiry, ...subscriptionWrite } = subscription;
      await connected.store.subscriptions.upsert(subscriptionWrite);
      assert.equal((await connected.store.subscriptions.findByIpo("fixture-mills-sme")).length, 1);
    });

    it("stores statements, registrar references, and source documents idempotently", async () => {
      const fetchedAt = new Date("2026-01-03T00:00:00.000Z");
      await connected.store.financials.upsert({
        companyId: "fixture-mills",
        fiscalYearLabel: "FY-fixture",
        revenueRupees: null,
        profitAfterTaxRupees: 0,
        earningsPerShareRupees: null,
        source: source(fetchedAt),
      });
      await connected.store.financials.upsert({
        companyId: "fixture-mills",
        fiscalYearLabel: "FY-fixture",
        revenueRupees: null,
        profitAfterTaxRupees: null,
        earningsPerShareRupees: null,
        source: source(fetchedAt),
      });
      const statements = await connected.store.financials.findByCompany("fixture-mills");
      assert.equal(statements.length, 1);
      assert.equal(statements[0]?.profitAfterTaxRupees, null);

      await connected.store.registrars.upsert({
        id: "fixture-registrar",
        name: "Fixture Registrar",
        websiteUrl: null,
        allotmentUrl: "https://example.com/fixture-allotment",
        source: source(fetchedAt),
      });
      assert.equal((await connected.store.registrars.findById("fixture-registrar"))?.name, "Fixture Registrar");

      await connected.store.sources.upsert({
        ipoId: "fixture-mills-sme",
        kind: "drhp",
        title: "Fixture DRHP",
        url: "https://example.com/fixture-drhp",
        publishedOn: null,
        source: source(fetchedAt),
      });
      await connected.store.sources.upsert({
        ipoId: "fixture-mills-sme",
        kind: "drhp",
        title: "Fixture DRHP revised",
        url: "https://example.com/fixture-drhp",
        publishedOn: null,
        source: source(fetchedAt),
      });
      const documents = await connected.store.sources.findByIpo("fixture-mills-sme");
      assert.equal(documents.length, 1);
      assert.equal(documents[0]?.title, "Fixture DRHP revised");
    });

    it("keeps sync history and provider usage idempotent until retention", async () => {
      const startedAt = new Date("2026-10-01T00:00:00.000Z");
      await connected.store.sync.upsert({
        providerKey: "fixture-provider",
        resource: "ipos",
        startedAt,
        finishedAt: null,
        status: "running",
        fetchedCount: 0,
        errorName: null,
      });
      await connected.store.sync.upsert({
        providerKey: "fixture-provider",
        resource: "ipos",
        startedAt,
        finishedAt: startedAt,
        status: "succeeded",
        fetchedCount: 0,
        errorName: null,
      });
      const runs = await connected.store.sync.findByProvider("fixture-provider");
      assert.equal(runs.length, 1);
      assert.equal(runs[0]?.status, "succeeded");
      assert.equal(runs[0]?.fetchedCount, 0);

      const requestedAt = new Date("2026-10-01T01:00:00.000Z");
      await connected.store.usage.upsert({
        providerKey: "fixture-provider",
        endpoint: "/fixture",
        usageId: "usage-fixture-1",
        requestedAt,
        statusCode: 200,
        durationMs: null,
      });
      await connected.store.usage.upsert({
        providerKey: "fixture-provider",
        endpoint: "/fixture",
        usageId: "usage-fixture-1",
        requestedAt,
        statusCode: 204,
        durationMs: 40,
      });
      const usage = await connected.store.usage.findByProvider("fixture-provider");
      assert.equal(usage.length, 1);
      assert.equal(usage[0]?.statusCode, 204);
      assert.equal(usage[0]?.durationMs, 40);
    });

    it("indexes slugs, names, statuses, issue types, dates, and observation identity", async () => {
      const companyIndexes = (await CompanyModel.collection.indexes()) as IndexInfo[];
      const ipoIndexes = (await IpoModel.collection.indexes()) as IndexInfo[];
      const gmpIndexes = (await GmpObservationModel.collection.indexes()) as IndexInfo[];
      assert.equal(hasIndex(companyIndexes, { name: 1 }), true);
      assert.equal(hasIndex(companyIndexes, { symbol: 1 }), true);
      assert.equal(hasIndex(ipoIndexes, { slug: 1 }, { unique: true }), true);
      assert.equal(hasIndex(ipoIndexes, { status: 1 }), true);
      assert.equal(hasIndex(ipoIndexes, { board: 1 }), true);
      assert.equal(hasIndex(ipoIndexes, { board: 1, status: 1, "dates.openDate": -1 }), true);
      assert.equal(hasIndex(ipoIndexes, { "dates.openDate": 1 }), true);
      assert.equal(hasIndex(ipoIndexes, { "dates.closeDate": 1 }), true);
      assert.equal(hasIndex(ipoIndexes, { "dates.allotmentDate": 1 }), true);
      assert.equal(hasIndex(ipoIndexes, { "dates.listingDate": 1 }), true);
      assert.equal(
        hasIndex(ipoIndexes, { "providerMappings.providerKey": 1, "providerMappings.externalId": 1 }, { unique: true }),
        true,
      );
      assert.equal(hasIndex(gmpIndexes, { ipoId: 1, observedAt: 1, session: 1 }, { unique: true }), true);
      assert.equal(hasIndex(gmpIndexes, { expiresAt: 1 }, { expireAfterSeconds: 0 }), true);
    });

    it("reports database readiness and disconnects on shutdown", async () => {
      assert.ok(connected);
      const logger = createLogger({ level: "error", service: "test", sink: () => undefined });
      const running = await startServer(
        {
          nodeEnv: "test",
    deployment: "test",
          host: "127.0.0.1",
          port: 0,
          corsOrigins: [],
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
        },
        logger,
        connected,
      );
      try {
        const response = await fetch(`${running.url}/api/v1/ready`, { headers: { connection: "close" } });
        const body = readyResponseSchema.parse(await response.json());
        assert.equal(response.status, 200);
        assert.equal(body.checks.database, "ok");
      } finally {
        assert.equal(await running.shutdown(), true);
      }
      assert.equal(await connected.check(), "ok");
    });
  });
});
