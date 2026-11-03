import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultAccountPreferences,
  ipoSchema,
  mobileAuthClientHeader,
  mobileSecureStoreKeys,
  type Ipo,
  type IpoSummary,
  type WatchlistItem,
} from "@ipo-singh/contracts";
import { createAuthSession } from "../auth/session.ts";
import { createMemorySecretStore } from "../auth/secrets.ts";
import { guestWatchlistSupported, watchlistCacheKey } from "./cache.ts";
import { createWatchlistController, type AccountCaller } from "./controller.ts";
import { dedupeWatchlist, summaryFromDetail, visibleWatchlist, watchlistCollectionPath, watchlistStatusMessage } from "./list.ts";

const origin = "https://api.example.com";
const access = "a".repeat(43);
const refresh = "b".repeat(43);
const nextAccess = "c".repeat(43);
const nextRefresh = "d".repeat(43);
const now = new Date("2026-10-26T10:00:00.000Z");

const provenance = { sourceName: "IPO Singh", retrievedAt: "2026-10-25T12:00:00.000Z", freshness: "fresh" as const };

function summary(patch: Partial<IpoSummary> = {}): IpoSummary {
  return {
    id: "fixture-polymers",
    slug: "fixture-polymers-ltd",
    companyName: "Fixture Polymers",
    board: "mainboard",
    status: "open",
    openDate: "2026-10-20",
    closeDate: "2026-10-22",
    gmpAmountRupees: null,
    subscriptionTotalTimes: 0,
    provenance,
    ...patch,
  };
}

function item(ipo: IpoSummary, addedAt = now.toISOString()): WatchlistItem {
  return { ipoId: ipo.id, addedAt, note: null, availability: "available", ipo };
}

const account = {
  id: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f",
  email: "phone@example.com",
  displayName: "Phone Reader",
  status: "active" as const,
  role: "member" as const,
  preferences: defaultAccountPreferences,
  createdAt: "2026-10-26T04:00:00.000Z",
  updatedAt: "2026-10-26T04:00:00.000Z",
  statusChangedAt: "2026-10-26T04:00:00.000Z",
  lastAuthenticatedAt: "2026-10-26T04:00:00.000Z",
};

function json(status: number, body: unknown): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function grant(accessToken: string, refreshToken: string) {
  return { account, accessToken, refreshToken };
}

function storedIpo(patch: Partial<Ipo> = {}): Ipo {
  return ipoSchema.parse({
    id: "fixture-polymers",
    slug: "fixture-polymers-ltd",
    companyName: "Fixture Polymers",
    board: "mainboard",
    status: "listed",
    offer: {
      priceBand: { lowRupees: 100, highRupees: 110 },
      issuePriceRupees: 100,
      issueSizeRupees: 0,
      lotSizeShares: 10,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: "2026-10-20", closeDate: "2026-10-22", allotmentDate: null, listingDate: null },
    gmp: null,
    subscription: null,
    financials: [],
    registrar: null,
    documents: [],
    listing: null,
    provenance,
    ...patch,
  });
}

function sharedCatalogue(catalogue: readonly IpoSummary[]) {
  const known = new Map(catalogue.map((ipo) => [ipo.id, ipo]));
  const rows = new Map<string, WatchlistItem>();
  const calls: string[] = [];
  const caller = (async (input: { path: string; method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }) => {
    calls.push(`${input.method ?? "GET"} ${input.path}`);
    assert.equal(input.path.includes("ipoguru"), false);
    assert.equal(input.path.startsWith("/api/v1/watchlist"), true);
    if ((input.method ?? "GET") === "GET" && input.path === watchlistCollectionPath) {
      return { status: "ready", value: { items: [...rows.values()] } };
    }
    if (input.method === "POST" && input.path === watchlistCollectionPath) {
      const body = input.body as { ipoId?: string; slug?: string };
      assert.equal(body.slug, undefined);
      const ipo = known.get(body.ipoId ?? "");
      if (!ipo) return { status: "rejected", message: "That IPO is not stored." };
      const saved = rows.get(ipo.id) ?? item(ipo);
      rows.set(saved.ipoId, saved);
      return { status: "ready", value: saved };
    }
    if (input.method === "DELETE") {
      const ipoId = input.path.slice(`${watchlistCollectionPath}/`.length);
      rows.delete(ipoId);
      return { status: "ready", value: null };
    }
    return { status: "unavailable", message: "Unexpected watchlist request." };
  }) as AccountCaller;
  return { rows, calls, caller };
}

test("the same account watchlist is shared by two clients and uses the IPO id", async () => {
  const storedMainboard = summary({ slug: "stored-slug" });
  const sme = summary({ id: "fixture-sme", slug: "fixture-sme-ltd", companyName: "Fixture SME", board: "sme" });
  const backend = sharedCatalogue([storedMainboard, sme]);
  const phone = createWatchlistController(backend.caller);
  const website = createWatchlistController(backend.caller);
  const mainboard = summary();

  const saved = await phone.toggle(mainboard, now);
  assert.equal(saved.status, "ready");
  assert.deepEqual(backend.calls[0], "POST /api/v1/watchlist");
  await website.load();
  assert.deepEqual(website.items().map((entry) => entry.ipoId), ["fixture-polymers"]);
  assert.equal(website.items()[0]?.ipo?.slug, "stored-slug");

  await phone.toggle(sme, now);
  await website.load();
  assert.deepEqual(visibleWatchlist(website.items(), "sme").map((entry) => entry.ipoId), ["fixture-sme"]);
  assert.deepEqual(visibleWatchlist(website.items(), "mainboard").map((entry) => entry.ipoId), ["fixture-polymers"]);

  await phone.remove("fixture-polymers");
  await website.load();
  assert.deepEqual(website.items().map((entry) => entry.ipoId), ["fixture-sme"]);
});

test("a repeated save of the same IPO id stays one row", async () => {
  const backend = sharedCatalogue([summary()]);
  const phone = createWatchlistController(backend.caller);
  const website = createWatchlistController(backend.caller);
  const ipo = summary();
  await phone.toggle(ipo, now);
  await website.toggle(ipo, now);
  assert.equal(website.items().length, 1);
  assert.equal(backend.rows.size, 1);
  backend.rows.set("fixture-polymers", item(ipo));
  const duplicate = item(ipo, "2026-10-26T11:00:00.000Z");
  const loaded = dedupeWatchlist([item(ipo), duplicate, item(summary({ id: "fixture-sme", board: "sme" }))]);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0]?.addedAt, now.toISOString());
});

test("a failed or offline change rolls back and an offline load keeps the last list", async () => {
  let mode: "ready" | "offline" | "rejected" = "ready";
  const rows = new Map<string, WatchlistItem>();
  let fetches = 0;
  const caller = (async (input: { path: string; method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }) => {
    if (mode === "offline") return { status: "offline" };
    fetches += 1;
    if (mode === "rejected") return { status: "rejected", message: "That IPO is not stored." };
    if (input.method === "POST") {
      const body = input.body as { ipoId: string };
      const saved = item(summary({ id: body.ipoId }));
      rows.set(saved.ipoId, saved);
      return { status: "ready", value: saved };
    }
    return { status: "ready", value: { items: [...rows.values()] } };
  }) as AccountCaller;
  const controller = createWatchlistController(caller);
  mode = "offline";
  const offlineSave = await controller.toggle(summary(), now);
  assert.equal(offlineSave.status, "offline");
  assert.equal(fetches, 0);
  assert.equal(controller.items().length, 0);
  assert.equal(watchlistStatusMessage("offline", "change"), "The watchlist could not be changed while offline.");

  mode = "ready";
  await controller.toggle(summary(), now);
  assert.equal(controller.items().length, 1);
  mode = "offline";
  const kept = await controller.load();
  assert.equal(kept.status, "offline");
  assert.equal(controller.items().length, 1);

  mode = "rejected";
  const failed = await controller.toggle(summary({ id: "missing-issue", slug: "missing-issue" }), now);
  assert.equal(failed.status, "rejected");
  assert.deepEqual(controller.items().map((entry) => entry.ipoId), ["fixture-polymers"]);
});

test("an expired access secret refreshes once and a revoked refresh signs the watchlist out", async () => {
  const store = createMemorySecretStore();
  await store.set(mobileSecureStoreKeys.access, access);
  await store.set(mobileSecureStoreKeys.refresh, refresh);
  let watchlistCalls = 0;
  let refreshCalls = 0;
  const rows = [item(summary())];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    assert.equal(url.includes("ipoguru"), false);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get(mobileAuthClientHeader), "ios");
    if (url.endsWith("/api/v1/auth/refresh")) {
      refreshCalls += 1;
      return json(200, grant(nextAccess, nextRefresh));
    }
    watchlistCalls += 1;
    if (headers.get("authorization") === `Bearer ${access}`) return json(401, { code: "unauthenticated", message: "Sign in required." });
    assert.equal(headers.get("authorization"), `Bearer ${nextAccess}`);
    return json(200, { items: rows });
  };
  const session = createAuthSession({ store, origin, client: "ios", fetchImpl });
  const controller = createWatchlistController((input) => session.authorized(input));
  const loaded = await controller.load();
  assert.equal(loaded.status, "ready");
  assert.equal(refreshCalls, 1);
  assert.equal(watchlistCalls, 2);
  assert.equal(controller.items()[0]?.ipoId, "fixture-polymers");

  const revoked = createMemorySecretStore();
  await revoked.set(mobileSecureStoreKeys.access, access);
  await revoked.set(mobileSecureStoreKeys.refresh, refresh);
  const revokedFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/v1/auth/refresh")) return json(401, { code: "unauthenticated", message: "Sign in required." });
    return json(401, { code: "unauthenticated", message: "Sign in required." });
  };
  const revokedSession = createAuthSession({ store: revoked, origin, client: "android", fetchImpl: revokedFetch });
  const signedOut = createWatchlistController((input) => revokedSession.authorized(input));
  await signedOut.toggle(summary(), now);
  const result = await signedOut.load();
  assert.equal(result.status, "signed-out");
  assert.deepEqual(signedOut.items(), []);
  assert.deepEqual(revoked.records(), {});
});

test("guest watchlists stay unsupported and the cache key is account-scoped", () => {
  assert.equal(guestWatchlistSupported, false);
  assert.equal(watchlistCacheKey(account.id), `ipo-singh.watchlist.${account.id}`);
  assert.equal(watchlistStatusMessage("signed-out", "change"), "Sign in to save this IPO.");
});

test("detail summaries keep the canonical id and do not fill a missing premium", () => {
  const missing = summaryFromDetail(storedIpo());
  assert.equal(missing?.id, "fixture-polymers");
  assert.equal(missing?.slug, "fixture-polymers-ltd");
  assert.equal(missing?.gmpAmountRupees, null);
  assert.equal(missing?.subscriptionTotalTimes, null);
  const publishedZero = summaryFromDetail(storedIpo({
    gmp: { amountRupees: 0, percent: 0, indicativeImpliedPriceRupees: null, observedAt: null, freshness: "fresh" },
    subscription: { retailTimes: 0, qibTimes: null, niiTimes: null, employeeTimes: null, totalTimes: 0, observedAt: null, freshness: "fresh", categories: [] },
  }));
  assert.equal(publishedZero?.gmpAmountRupees, 0);
  assert.equal(publishedZero?.subscriptionTotalTimes, 0);
  assert.equal(visibleWatchlist([{ ipoId: "fixture-polymers", addedAt: now.toISOString(), note: null, availability: "unavailable", ipo: null }], "mainboard").length, 0);
  assert.equal(visibleWatchlist([{ ipoId: "fixture-polymers", addedAt: now.toISOString(), note: null, availability: "unavailable", ipo: null }], "all").length, 1);
});
