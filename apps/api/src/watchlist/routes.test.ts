import { watchlistItemSchema, watchlistMembershipSchema, watchlistResponseSchema } from "@ipo-singh/contracts";
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
import type { CompanyRecord, GmpObservationRecord, IpoRecord } from "../db/records.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import { startServer, type RunningServer } from "../index.ts";
import { createLogger } from "../shared/logger.ts";
import { createMemoryWatchlistStore } from "./memory-store.ts";

const password = "Horse-battery-99";
const ipoId = "fixture-mills";

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

const source = {
  source: "Fixture",
  fetchedAt: new Date("2026-10-18T04:30:00.000Z"),
  sourceUpdatedAt: null,
  freshness: "fresh" as const,
};

function catalogue(): { store: PersistenceStore; removeIssue: () => void } {
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
    dates: { openDate: "2026-10-20", closeDate: "2026-10-22", allotmentDate: null, listingDate: null },
    listing: null,
    registrarId: null,
    providerMappings: [],
    source,
  };
  const gmp: GmpObservationRecord = {
    ipoId,
    observedAt: source.fetchedAt,
    session: "daily",
    amountRupees: 15,
    percent: null,
    indicativeImpliedPriceRupees: null,
    source,
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  };
  const issues = [issue];
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
        return issues.find((item) => item.id === id) ?? null;
      },
      async findBySlug(slug) {
        return issues.find((item) => item.slug === slug) ?? null;
      },
      async list() {
        return [...issues];
      },
    },
    gmp: {
      upsert: unused,
      async findByIpo(id) {
        return id === ipoId && issues.length > 0 ? [gmp] : [];
      },
    },
    subscriptions: { upsert: unused, async findByIpo() { return []; } },
    financials: { upsert: unused, async findByCompany() { return []; } },
    registrars: { upsert: unused, async findById() { return null; } },
    sources: { upsert: unused, async findByIpo() { return []; } },
    sync: { upsert: unused, findByProvider: unused },
    usage: { upsert: unused, findByProvider: unused },
  };
  return {
    store,
    removeIssue() {
      issues.splice(0, issues.length);
    },
  };
}

describe("watchlist", () => {
  const servers: RunningServer[] = [];

  after(async () => {
    await Promise.all(servers.map((item) => item.shutdown()));
  });

  it("saves one IPO id per user, rejects copies and other users, and keeps the catalogue public", async () => {
    const listed = catalogue();
    const watchlist = createMemoryWatchlistStore();
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
      watchlist,
    };
    const server = await startServer(config(), logger, database, createUnconfiguredCache(defaultCachePolicy(), defaultQuotaPolicy(), logger), undefined, {
      hasher: createFastPasswordHasher(),
      attempts: createLoginAttemptLimiter({ maxFailures: 20, windowMs: 60_000 }),
    });
    servers.push(server);

    const open = await fetch(`${server.url}/api/v1/ipos`, { headers: { connection: "close" } });
    assert.equal(open.status, 200);
    await open.arrayBuffer();
    const anonymous = await fetch(`${server.url}/api/v1/watchlist`, { headers: { connection: "close" } });
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

    const copied = await fetch(`${server.url}/api/v1/watchlist`, {
      method: "POST",
      headers: authHeaders(ownerCookies),
      body: JSON.stringify({ ipoId, gmpAmountRupees: 99, companyName: "Copied Mills" }),
    });
    assert.equal(copied.status, 400);
    await copied.arrayBuffer();

    const missing = await fetch(`${server.url}/api/v1/watchlist`, {
      method: "POST",
      headers: authHeaders(ownerCookies),
      body: JSON.stringify({ ipoId: "missing-issue" }),
    });
    assert.equal(missing.status, 404);
    await missing.arrayBuffer();

    const saved = await fetch(`${server.url}/api/v1/watchlist`, {
      method: "POST",
      headers: authHeaders(ownerCookies),
      body: JSON.stringify({ ipoId, note: "Check the close date" }),
    });
    const savedItem = watchlistItemSchema.parse(await saved.json());
    assert.equal(saved.status, 200);
    assert.equal(savedItem.availability, "available");
    assert.equal(savedItem.ipo?.companyName, "Fixture Mills");
    assert.equal(savedItem.ipo?.gmpAmountRupees, 15);
    assert.equal(savedItem.note, "Check the close date");
    assert.equal(JSON.stringify(savedItem).includes("passwordHash"), false);

    const again = await fetch(`${server.url}/api/v1/watchlist`, {
      method: "POST",
      headers: authHeaders(ownerCookies),
      body: JSON.stringify({ ipoId }),
    });
    const againItem = watchlistItemSchema.parse(await again.json());
    assert.equal(again.status, 200);
    assert.equal(againItem.addedAt, savedItem.addedAt);
    assert.equal(againItem.note, "Check the close date");
    const probe = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { cookie: cookieHeader(ownerCookies), connection: "close" },
    });
    const ownerId = ((await probe.json()) as { account: { id: string } }).account.id;
    const listedRows = await watchlist.listForUser(ownerId);
    assert.equal(listedRows.length, 1);
    assert.deepEqual(Object.keys(listedRows[0] ?? {}).sort(), ["addedAt", "id", "ipoId", "note", "userId"]);
    assert.equal(listedRows[0]?.ipoId, ipoId);
    assert.equal("companyName" in (listedRows[0] ?? {}), false);
    assert.equal("gmpAmountRupees" in (listedRows[0] ?? {}), false);

    const otherDevice = watchlistResponseSchema.parse(
      await (
        await fetch(`${server.url}/api/v1/watchlist`, { headers: { cookie: cookieHeader(otherCookies), connection: "close" } })
      ).json(),
    );
    assert.equal(otherDevice.items.length, 1);
    assert.equal(otherDevice.items[0]?.ipo?.gmpAmountRupees, 15);

    const bearer = await fetch(`${server.url}/api/v1/watchlist/${ipoId}`, {
      headers: { authorization: `Bearer ${cookieValue(otherCookies, "ipo_singh_access")}`, connection: "close" },
    });
    const membership = watchlistMembershipSchema.parse(await bearer.json());
    assert.equal(bearer.status, 200);
    assert.equal(membership.saved, true);

    const hidden = watchlistResponseSchema.parse(
      await (
        await fetch(`${server.url}/api/v1/watchlist`, { headers: { cookie: cookieHeader(strangerCookies), connection: "close" } })
      ).json(),
    );
    assert.equal(hidden.items.length, 0);
    const blocked = await fetch(`${server.url}/api/v1/watchlist/${ipoId}`, {
      method: "DELETE",
      headers: authHeaders(strangerCookies),
    });
    assert.equal(blocked.status, 404);
    await blocked.arrayBuffer();
    assert.equal((await watchlist.listForUser(listedRows[0]?.userId ?? "")).length, 1);

    listed.removeIssue();
    const gone = watchlistResponseSchema.parse(
      await (
        await fetch(`${server.url}/api/v1/watchlist`, { headers: { cookie: cookieHeader(ownerCookies), connection: "close" } })
      ).json(),
    );
    assert.equal(gone.items[0]?.availability, "unavailable");
    assert.equal(gone.items[0]?.ipo, null);
    assert.equal(JSON.stringify(gone.items[0]).includes("Fixture Mills"), false);

    const removed = await fetch(`${server.url}/api/v1/watchlist/${ipoId}`, {
      method: "DELETE",
      headers: authHeaders(otherCookies),
    });
    assert.equal(removed.status, 204);
    await removed.arrayBuffer();
    const empty = watchlistResponseSchema.parse(
      await (
        await fetch(`${server.url}/api/v1/watchlist`, { headers: { cookie: cookieHeader(ownerCookies), connection: "close" } })
      ).json(),
    );
    assert.equal(empty.items.length, 0);
  });
});
