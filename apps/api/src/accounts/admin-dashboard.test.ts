import { adminDashboardSchema, adminIpoInspectionSchema, adminSyncHistorySchema, apiErrorSchema } from "@ipo-singh/contracts";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createUnconfiguredCache, type CacheHandle } from "../cache/connection.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import type { AppConfig } from "../config/env.ts";
import { defaultHttpLimits } from "../config/http-limits.ts";
import { disabledIpoGuruConfig } from "../config/ipoguru.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import type { CompanyRecord, IpoRecord, SyncRunRecord } from "../db/records.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import { startServer, type RunningServer } from "../index.ts";
import { createMemoryNotificationStore } from "../notifications/memory-store.ts";
import type { IpoGuruClient } from "../providers/ipo-guru/client.ts";
import { createLogger } from "../shared/logger.ts";
import { createMemoryAdminAuditStore } from "./audit.ts";
import { assessManualCatalogSync } from "./catalog-sync.ts";
import { buildAdminDashboard } from "./dashboard.ts";
import { createLoginAttemptLimiter } from "./attempts.ts";
import { createMemoryAccountStore } from "./memory-store.ts";
import { createFastPasswordHasher } from "./passwords.ts";
import { createMemoryWatchlistStore } from "../watchlist/memory-store.ts";

const password = "Horse-battery-99";
const opsSecret = "ops-secret-value";
const leakedPlan = "secret-plan-should-not-leak";
const leakedKey = "ipo-guru-key-should-not-leak";
const leakedExternal = "provider-external-secret";

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  const http = defaultHttpLimits();
  return {
    nodeEnv: "test",
    deployment: "test",
    host: "127.0.0.1",
    port: 0,
    corsOrigins: ["http://localhost:3000"],
    logLevel: "error",
    requestBodyLimit: "100kb",
    shutdownTimeoutMs: 1000,
    ...http,
    rateLimit: { ...http.rateLimit, authPerWindow: 100, adminPerWindow: 100 },
    trustProxy: false,
    serviceName: "ipo-singh-api",
    version: "0.1.0",
    mongodb: null,
    redis: null,
    cache: defaultCachePolicy(),
    quota: defaultQuotaPolicy(),
    provider: { primary: "mock", fallback: null, timeoutMs: 8_000 },
    ipoGuru: disabledIpoGuruConfig(),
    internalServiceToken: null,
    opsToken: opsSecret,
    ...overrides,
  };
}

function quiet() {
  return createLogger({ level: "error", service: "ipo-singh-api", sink: () => undefined });
}

function accounts() {
  return {
    hasher: createFastPasswordHasher(),
    attempts: createLoginAttemptLimiter({ maxFailures: 20, windowMs: 60_000 }),
  };
}

function cookieHeader(setCookies: readonly string[]): string {
  return setCookies.map((line) => line.split(";")[0] ?? "").join("; ");
}

function cookieValue(setCookies: readonly string[], name: string): string {
  const line = setCookies.find((item) => item.startsWith(`${name}=`));
  return decodeURIComponent((line?.split(";")[0] ?? "").slice(name.length + 1));
}

function authHeaders(setCookies: readonly string[]): Headers {
  return new Headers({
    cookie: cookieHeader(setCookies),
    "content-type": "application/json",
    "x-csrf-token": cookieValue(setCookies, "ipo_singh_csrf"),
    connection: "close",
  });
}

function source() {
  return { source: "memory", fetchedAt: new Date("2026-10-25T00:00:00.000Z"), sourceUpdatedAt: null, freshness: "fresh" as const };
}

function ipo(input: Pick<IpoRecord, "id" | "slug" | "companyId" | "board" | "status">): IpoRecord {
  return {
    ...input,
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
    providerMappings: [{ providerKey: "mock", externalId: leakedExternal }],
    source: source(),
  };
}

function catalogue(rows: readonly IpoRecord[], runs: readonly SyncRunRecord[] = []): PersistenceStore {
  const companies: CompanyRecord[] = [{ id: "northwind", name: "Northwind Metals", symbol: null, source: source() }];
  return {
    ipos: { list: async () => [...rows] },
    companies: { list: async () => companies },
    sync: { findByProvider: async () => [...runs] },
  } as unknown as PersistenceStore;
}

function cacheWith(snapshot: { minuteUsed: number | null; dayUsed: number | null }): CacheHandle {
  const base = createUnconfiguredCache(defaultCachePolicy(), defaultQuotaPolicy(), quiet());
  return {
    ...base,
    quota: {
      run: (load) => base.quota.run(load),
      snapshot: async () => snapshot,
    },
  };
}

describe("administrator dashboard", () => {
  const servers: RunningServer[] = [];

  after(async () => {
    await Promise.all(servers.map((item) => item.shutdown()));
  });

  it("refuses a catalogue sync in production, without quota, or without a provider", () => {
    const base = {
      provider: { primary: "mock" as const, fallback: null, timeoutMs: 8_000 },
      ipoGuruEnabled: false,
      minuteUsed: 0,
      minuteLimit: 30,
      dayUsed: 0,
      dayLimit: 1_000,
      reservedRequests: 50,
    };
    assert.equal(assessManualCatalogSync({ ...base, nodeEnv: "production" }), "production");
    assert.equal(assessManualCatalogSync({ ...base, nodeEnv: "test", minuteUsed: null }), "unknown_quota");
    assert.equal(assessManualCatalogSync({ ...base, nodeEnv: "test", minuteUsed: 30 }), "quota");
    assert.equal(assessManualCatalogSync({ ...base, nodeEnv: "test", dayUsed: 950 }), "quota");
    assert.equal(assessManualCatalogSync({ ...base, nodeEnv: "test", provider: null }), "unconfigured");
    assert.equal(assessManualCatalogSync({ ...base, nodeEnv: "test", provider: { primary: "ipo-guru", fallback: null, timeoutMs: 8_000 } }), "unconfigured");
    assert.equal(assessManualCatalogSync({ ...base, nodeEnv: "test" }), "allowed");
  });

  it("keeps a missing store distinct from an empty catalogue", async () => {
    const cache = createUnconfiguredCache(defaultCachePolicy(), defaultQuotaPolicy(), quiet());
    const missing = await buildAdminDashboard({
      config: config(),
      database: { async check() { return "not_configured"; }, async close() { return undefined; } },
      cache,
      ipoGuru: { async monitor() { throw new Error("provider down"); } } as unknown as IpoGuruClient,
    });
    assert.equal(missing.records.available, false);
    assert.equal(missing.records.total, null);
    assert.equal(missing.records.mainboard, null);
    assert.equal(missing.accounts.available, false);
    assert.equal(missing.accounts.member, null);
    assert.equal(missing.watchlist.available, false);
    assert.equal(missing.watchlist.saved, null);
    assert.equal(missing.provider.health, "unavailable");
    assert.equal(missing.provider.lastFailure, null);
    assert.equal(missing.quota.vendorRemaining, null);
    assert.equal(missing.database, "not_configured");

    const empty = await buildAdminDashboard({
      config: config(),
      database: {
        async check() { return "ok"; },
        async close() { return undefined; },
        store: catalogue([]),
        accounts: createMemoryAccountStore(),
        watchlist: createMemoryWatchlistStore(),
        notifications: createMemoryNotificationStore(),
      },
      cache,
    });
    assert.equal(empty.records.available, true);
    assert.equal(empty.records.complete, true);
    assert.equal(empty.records.total, 0);
    assert.equal(empty.records.open, 0);
    assert.equal(empty.watchlist.saved, 0);
    assert.equal(empty.notifications.stored, 0);
    assert.equal(empty.accounts.available, true);
    assert.equal(empty.accounts.active, 0);
    const down = await buildAdminDashboard({
      config: config(),
      database: {
        async check() { return "unavailable"; },
        async close() { return undefined; },
        store: catalogue([ipo({ id: "kept", slug: "kept", companyId: "northwind", board: "sme", status: "open" })]),
      },
      cache,
    });
    assert.equal(down.records.available, false);
    assert.equal(down.records.total, null);
    assert.equal(down.database, "unavailable");
  });

  it("counts stored rows, hides secrets, and blocks an unbounded sync", async () => {
    const store = createMemoryAccountStore();
    const audit = createMemoryAdminAuditStore();
    const usage = { minuteUsed: 0 as number | null, dayUsed: 0 as number | null };
    const calls = { count: 0 };
    const appConfig = config();
    const rows = [
      ipo({ id: "open-main", slug: "open-main", companyId: "northwind", board: "mainboard", status: "open" }),
      ipo({ id: "soon-sme", slug: "soon-sme", companyId: "northwind", board: "sme", status: "upcoming" }),
      ipo({ id: "listed-main", slug: "listed-main", companyId: "missing-co", board: "mainboard", status: "listed" }),
      ipo({ id: "blank-sme", slug: "blank-sme", companyId: "northwind", board: "sme", status: null }),
    ];
    const runs: SyncRunRecord[] = [
      {
        providerKey: "mock",
        resource: "catalogue",
        startedAt: new Date("2026-10-25T01:00:00.000Z"),
        finishedAt: new Date("2026-10-25T01:00:01.000Z"),
        status: "failed",
        fetchedCount: 0,
        errorName: "SyncRejectedError",
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
      {
        providerKey: "mock",
        resource: "catalog-catalogue",
        startedAt: new Date("2026-10-24T01:00:00.000Z"),
        finishedAt: new Date("2026-10-24T01:00:02.000Z"),
        status: "succeeded",
        fetchedCount: 4,
        errorName: null,
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
    ];
    const database: DatabaseHandle = {
      async check() { return "ok"; },
      async close() { return undefined; },
      store: catalogue(rows, runs),
      accounts: store,
      adminAudit: audit,
      watchlist: createMemoryWatchlistStore(),
      notifications: createMemoryNotificationStore(),
    };
    const guru = {
      async monitor() {
        return {
          enabled: true,
          vendor: { plan: null, limit: 1000, remaining: 12 },
          account: { plan: leakedPlan },
          lastFailure: { httpStatus: 503, code: "outage", observedAt: "2026-10-25T02:00:00.000Z" },
          apiKey: leakedKey,
        };
      },
    } as unknown as IpoGuruClient;
    const server = await startServer(appConfig, quiet(), database, cacheWith(usage), guru, {
      ...accounts(),
      runCatalogSync: async () => {
        calls.count += 1;
        return { status: "idle", fetchedCount: 0 };
      },
    });
    servers.push(server);

    const plain = await startServer(config(), quiet(), undefined, undefined, undefined, accounts());
    servers.push(plain);
    const open = await fetch(`${plain.url}/api/v1/ipos`, { headers: { connection: "close" } });
    assert.equal(open.status, 200);
    await open.arrayBuffer();
    const missingAuth = await fetch(`${plain.url}/api/v1/auth`, { headers: { connection: "close" } });
    assert.equal(missingAuth.status, 404);
    await missingAuth.arrayBuffer();

    async function register(email: string): Promise<string[]> {
      const response = await fetch(`${server.url}/api/v1/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json", connection: "close" },
        body: JSON.stringify({ email, password, displayName: "Reader" }),
      });
      assert.equal(response.status, 201);
      const cookies = response.headers.getSetCookie();
      await response.arrayBuffer();
      return cookies;
    }

    const memberCookies = await register("member@example.com");
    const staffCookies = await register("staff@example.com");
    const rootCookies = await register("root@example.com");
    const root = await store.findUserByEmail("root@example.com");
    const staff = await store.findUserByEmail("staff@example.com");
    assert.ok(root && staff);
    await store.saveUser({ ...root, role: "super-admin" });
    await store.saveUser({ ...staff, role: "admin" });

    const anonymous = await fetch(`${server.url}/api/v1/admin/dashboard`, { headers: { connection: "close" } });
    assert.equal(anonymous.status, 401);
    await anonymous.arrayBuffer();
    const memberDash = await fetch(`${server.url}/api/v1/admin/dashboard`, { headers: authHeaders(memberCookies) });
    assert.equal(memberDash.status, 403);
    await memberDash.arrayBuffer();

    const dashText = await (await fetch(`${server.url}/api/v1/admin/dashboard`, { headers: authHeaders(staffCookies) })).text();
    const dash = adminDashboardSchema.parse(JSON.parse(dashText));
    assert.equal(dash.records.total, 4);
    assert.equal(dash.records.mainboard, 2);
    assert.equal(dash.records.sme, 2);
    assert.equal(dash.records.open, 1);
    assert.equal(dash.records.upcoming, 1);
    assert.equal(dash.records.listed, 1);
    assert.equal(dash.records.statusMissing, 1);
    assert.equal(dash.records.closed, 0);
    assert.equal(dash.sync.available, true);
    assert.equal(dash.sync.failed, 1);
    assert.equal(dash.sync.succeeded, 1);
    assert.equal(dash.sync.lastSuccessAt, "2026-10-24T01:00:02.000Z");
    assert.equal(dash.provider.health, "unavailable");
    assert.equal(dash.provider.lastFailure?.httpStatus, 503);
    assert.equal(dash.quota.vendorRemaining, 12);
    assert.equal(dash.quota.dayRemaining, 1000);
    assert.equal(dash.accounts.member, 1);
    assert.equal(dash.accounts.admin, 1);
    assert.equal(dash.accounts.superAdmin, 1);
    assert.equal(dash.watchlist.saved, 0);
    assert.equal(dash.warnings.some((item) => item.code === "provider_outage"), true);
    assert.equal(dash.warnings.some((item) => item.code === "sync_failures"), true);
    for (const secret of [opsSecret, leakedPlan, leakedKey, leakedExternal, password, "member@example.com", "apiKey", "passwordHash", "refresh"]) {
      assert.equal(dashText.includes(secret), false);
    }

    const inspection = adminIpoInspectionSchema.parse(await (await fetch(`${server.url}/api/v1/admin/ipos`, { headers: authHeaders(staffCookies) })).json());
    assert.equal(inspection.records.length, 4);
    assert.equal(inspection.records.find((row) => row.slug === "listed-main")?.companyName, null);
    assert.equal(inspection.records.find((row) => row.slug === "open-main")?.companyName, "Northwind Metals");
    assert.equal(JSON.stringify(inspection).includes(leakedExternal), false);
    assert.equal(JSON.stringify(inspection).includes("priceBand"), false);

    const history = adminSyncHistorySchema.parse(await (await fetch(`${server.url}/api/v1/admin/sync`, { headers: authHeaders(staffCookies) })).json());
    assert.equal(history.available, true);
    assert.equal(history.runs[0]?.status, "failed");
    assert.equal(history.runs[0]?.errorName, "SyncRejectedError");

    const staffSync = await fetch(`${server.url}/api/v1/admin/sync`, {
      method: "POST",
      headers: authHeaders(staffCookies),
      body: JSON.stringify({ currentPassword: password }),
    });
    assert.equal(staffSync.status, 403);
    await staffSync.arrayBuffer();

    const extra = await fetch(`${server.url}/api/v1/admin/sync`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ currentPassword: password, category: "history" }),
    });
    assert.equal(extra.status, 400);
    await extra.arrayBuffer();

    const wrong = await fetch(`${server.url}/api/v1/admin/sync`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ currentPassword: "not-the-password" }),
    });
    assert.equal(wrong.status, 403);
    assert.equal(apiErrorSchema.parse(await wrong.json()).code, "forbidden");

    usage.minuteUsed = null;
    const unknown = await fetch(`${server.url}/api/v1/admin/sync`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ currentPassword: password }),
    });
    assert.equal(unknown.status, 503);
    await unknown.arrayBuffer();

    usage.minuteUsed = 30;
    usage.dayUsed = 0;
    const exhausted = await fetch(`${server.url}/api/v1/admin/sync`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ currentPassword: password }),
    });
    assert.equal(exhausted.status, 429);
    await exhausted.arrayBuffer();

    usage.minuteUsed = 0;
    appConfig.nodeEnv = "production";
    const production = await fetch(`${server.url}/api/v1/admin/sync`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ currentPassword: password }),
    });
    assert.equal(production.status, 403);
    await production.arrayBuffer();

    appConfig.nodeEnv = "test";
    appConfig.provider = null;
    const unconfigured = await fetch(`${server.url}/api/v1/admin/sync`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ currentPassword: password }),
    });
    assert.equal(unconfigured.status, 503);
    await unconfigured.arrayBuffer();

    appConfig.provider = { primary: "mock", fallback: null, timeoutMs: 8_000 };
    const started = await fetch(`${server.url}/api/v1/admin/sync`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ currentPassword: password }),
    });
    assert.equal(started.status, 200);
    assert.deepEqual(await started.json(), { status: "idle", fetchedCount: 0 });
    assert.equal(calls.count, 1);
    const events = await audit.listRecent(20);
    assert.equal(events.some((event) => event.action === "manual_sync" && event.outcome === "succeeded"), true);
    assert.equal(events.some((event) => event.action === "manual_sync" && event.outcome === "denied"), true);
  });
});
