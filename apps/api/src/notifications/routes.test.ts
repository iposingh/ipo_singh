import { notificationListSchema, notificationSchema, unreadNotificationCountSchema } from "@ipo-singh/contracts";
import { istCalendarDate } from "@ipo-singh/core";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createLoginAttemptLimiter } from "../accounts/attempts.ts";
import { createMemoryAccountStore } from "../accounts/memory-store.ts";
import { createFastPasswordHasher } from "../accounts/passwords.ts";
import { createUnconfiguredCache } from "../cache/connection.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import type { AppConfig } from "../config/env.ts";
import { defaultHttpLimits } from "../config/http-limits.ts";
import { disabledIpoGuruConfig } from "../config/ipoguru.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import type { CompanyRecord, GmpObservationRecord, IpoRecord, SubscriptionObservationRecord } from "../db/records.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import { startServer, type RunningServer } from "../index.ts";
import { createLogger } from "../shared/logger.ts";
import { createMemoryNotificationStore } from "./memory-store.ts";
import { createMemoryWatchlistStore } from "../watchlist/memory-store.ts";

const password = "Horse-battery-99";
const ipoId = "fixture-mills";
const today = istCalendarDate(new Date()) ?? "2026-10-23";

function config(): AppConfig {
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
    rateLimit: { ...http.rateLimit, authPerWindow: 100 },
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

function catalogue(): { store: PersistenceStore; moveCloseDate: () => void } {
  const source = {
    source: "Fixture",
    fetchedAt: new Date("2026-10-23T04:30:00.000Z"),
    sourceUpdatedAt: null,
    freshness: "fresh" as const,
  };
  const company: CompanyRecord = { id: "fixture-company", name: "Fixture Mills", symbol: "FXMILL", source };
  const issue: IpoRecord = {
    id: ipoId,
    slug: ipoId,
    companyId: company.id,
    board: "mainboard",
    status: "open",
    issue: {
      priceBandLowRupees: 100,
      priceBandHighRupees: 110,
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: 10,
      minimumInvestmentRupees: 1100,
    },
    dates: { openDate: today, closeDate: "2026-10-22", allotmentDate: null, listingDate: null },
    listing: null,
    registrarId: null,
    providerMappings: [],
    source,
  };
  const gmp: GmpObservationRecord[] = [
    {
      ipoId,
      observedAt: new Date("2026-10-23T08:00:00.000Z"),
      session: "daily",
      amountRupees: 40,
      percent: null,
      indicativeImpliedPriceRupees: null,
      source: { ...source, freshness: "stale" },
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    },
    {
      ipoId,
      observedAt: new Date("2026-10-22T08:00:00.000Z"),
      session: "daily",
      amountRupees: 15,
      percent: null,
      indicativeImpliedPriceRupees: null,
      source,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    },
  ];
  const subscription: SubscriptionObservationRecord = {
    ipoId,
    observedAt: source.fetchedAt,
    observedOn: today,
    retailTimes: null,
    qibTimes: null,
    niiTimes: null,
    employeeTimes: null,
    totalTimes: 0,
    source,
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  };
  const unused = async () => {
    throw new Error("Unexpected catalogue store call.");
  };
  const store: PersistenceStore = {
    companies: {
      upsert: unused,
      findByName: unused,
      async findById(id) {
        return id === company.id ? company : null;
      },
      async list() {
        return [company];
      },
    },
    ipos: {
      upsert: unused,
      findByProvider: unused,
      async findById(id) {
        return id === issue.id ? issue : null;
      },
      async findBySlug(slug) {
        return slug === issue.slug ? issue : null;
      },
      async list() {
        return [issue];
      },
    },
    gmp: { upsert: unused, async findByIpo(id) { return id === ipoId ? gmp : []; } },
    subscriptions: { upsert: unused, async findByIpo(id) { return id === ipoId ? [subscription] : []; } },
    financials: { upsert: unused, async findByCompany() { return []; } },
    registrars: { upsert: unused, async findById() { return null; } },
    sources: { upsert: unused, async findByIpo() { return []; } },
    sync: { upsert: unused, findByProvider: unused },
    usage: { upsert: unused, findByProvider: unused },
  };
  return {
    store,
    moveCloseDate() {
      issue.dates = { ...issue.dates, closeDate: "2026-10-28" };
    },
  };
}

describe("notifications", () => {
  const servers: RunningServer[] = [];

  after(async () => {
    await Promise.all(servers.map((item) => item.shutdown()));
  });

  it("creates one in-app notice from fresh stored facts and keeps other people out", async () => {
    const listed = catalogue();
    const notifications = createMemoryNotificationStore();
    const logger = createLogger({ level: "error", service: "ipo-singh-api", sink: () => undefined });
    const database: DatabaseHandle = {
      async check() {
        return "ok";
      },
      async close() {
        return undefined;
      },
      store: listed.store,
      accounts: createMemoryAccountStore(),
      watchlist: createMemoryWatchlistStore(),
      notifications,
    };
    const server = await startServer(config(), logger, database, createUnconfiguredCache(defaultCachePolicy(), defaultQuotaPolicy(), logger), undefined, {
      hasher: createFastPasswordHasher(),
      attempts: createLoginAttemptLimiter({ maxFailures: 20, windowMs: 60_000 }),
    });
    servers.push(server);

    const open = await fetch(`${server.url}/api/v1/ipos`, { headers: { connection: "close" } });
    assert.equal(open.status, 200);
    await open.arrayBuffer();
    const missingAuth = await fetch(`${server.url}/api/v1/auth`, { headers: { connection: "close" } });
    assert.equal(missingAuth.status, 404);
    await missingAuth.arrayBuffer();
    const anonymous = await fetch(`${server.url}/api/v1/notifications`, { headers: { connection: "close" } });
    assert.equal(anonymous.status, 401);
    await anonymous.arrayBuffer();

    const owner = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: "owner@example.com", password, displayName: "Owner" }),
    });
    const ownerCookies = owner.headers.getSetCookie();
    assert.equal(owner.status, 201);
    await owner.arrayBuffer();
    const otherSession = await fetch(`${server.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: "owner@example.com", password }),
    });
    const otherCookies = otherSession.headers.getSetCookie();
    assert.equal(otherSession.status, 200);
    await otherSession.arrayBuffer();
    const stranger = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: "stranger@example.com", password }),
    });
    const strangerCookies = stranger.headers.getSetCookie();
    assert.equal(stranger.status, 201);
    await stranger.arrayBuffer();

    const rejected = await fetch(`${server.url}/api/v1/notifications/preferences`, {
      method: "PATCH",
      headers: authHeaders(ownerCookies),
      body: JSON.stringify({ alertsEnabled: true, pushToken: "secret", email: "owner@example.com" }),
    });
    assert.equal(rejected.status, 400);
    await rejected.arrayBuffer();

    const enabled = await fetch(`${server.url}/api/v1/notifications/preferences`, {
      method: "PATCH",
      headers: authHeaders(ownerCookies),
      body: JSON.stringify({
        alertsEnabled: true,
        notificationCategories: { open: true, gmp: true, subscription: true, schedule: true },
      }),
    });
    assert.equal(enabled.status, 200);
    await enabled.arrayBuffer();

    const saved = await fetch(`${server.url}/api/v1/watchlist`, {
      method: "POST",
      headers: authHeaders(ownerCookies),
      body: JSON.stringify({ ipoId }),
    });
    assert.equal(saved.status, 200);
    await saved.arrayBuffer();

    const first = notificationListSchema.parse(await (await fetch(`${server.url}/api/v1/notifications`, { headers: authHeaders(ownerCookies) })).json());
    assert.deepEqual(first.items.map((item) => item.type), ["open"]);
    assert.equal(first.items[0]?.delivery.push, "not-sent");
    assert.equal(first.items[0]?.readAt, null);
    assert.equal(JSON.stringify(first).includes("passwordHash"), false);
    assert.equal(JSON.stringify(first).includes("pushToken"), false);
    const session = await fetch(`${server.url}/api/v1/auth/session`, { headers: { cookie: cookieHeader(ownerCookies), connection: "close" } });
    const ownerId = ((await session.json()) as { account: { id: string } }).account.id;
    const stored = await notifications.listForUser(ownerId, new Date());
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.dedupeKey.startsWith("open:"), true);
    assert.equal(stored[0]?.body.includes("Unofficial GMP"), false);
    assert.equal(stored[0]?.delivery.push, "not-sent");

    const again = notificationListSchema.parse(await (await fetch(`${server.url}/api/v1/notifications`, { headers: { cookie: cookieHeader(otherCookies), connection: "close" } })).json());
    assert.equal(again.items.length, 1);

    listed.moveCloseDate();
    const changed = notificationListSchema.parse(await (await fetch(`${server.url}/api/v1/notifications`, { headers: authHeaders(ownerCookies) })).json());
    assert.deepEqual(changed.items.map((item) => item.type).sort(), ["open", "schedule"]);

    const hidden = notificationListSchema.parse(await (await fetch(`${server.url}/api/v1/notifications`, { headers: { cookie: cookieHeader(strangerCookies), connection: "close" } })).json());
    assert.equal(hidden.items.length, 0);
    const blocked = await fetch(`${server.url}/api/v1/notifications/${changed.items[0]?.id}/read`, {
      method: "POST",
      headers: authHeaders(strangerCookies),
    });
    assert.equal(blocked.status, 404);
    await blocked.arrayBuffer();

    const bearer = unreadNotificationCountSchema.parse(await (await fetch(`${server.url}/api/v1/notifications/unread-count`, {
      headers: { authorization: `Bearer ${cookieValue(otherCookies, "ipo_singh_access")}`, connection: "close" },
    })).json());
    assert.equal(bearer.unreadCount, 2);

    const read = notificationSchema.parse(await (await fetch(`${server.url}/api/v1/notifications/${changed.items[0]?.id}/read`, {
      method: "POST",
      headers: authHeaders(ownerCookies),
    })).json());
    assert.equal(typeof read.readAt, "string");
    const rest = await fetch(`${server.url}/api/v1/notifications/read-all`, { method: "POST", headers: authHeaders(otherCookies) });
    assert.equal(rest.status, 200);
    await rest.arrayBuffer();
    const empty = unreadNotificationCountSchema.parse(await (await fetch(`${server.url}/api/v1/notifications/unread-count`, { headers: { cookie: cookieHeader(ownerCookies), connection: "close" } })).json());
    assert.equal(empty.unreadCount, 0);
  });
});
