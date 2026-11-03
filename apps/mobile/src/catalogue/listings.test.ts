import assert from "node:assert/strict";
import test from "node:test";
import { ipoSchema, type IpoSummary } from "@ipo-singh/contracts";
import { createCatalogueClient, eachLimited } from "./listings.ts";
import { boardListNotice } from "./notices.ts";
import { issueCacheKey, listCacheKey, memoryJsonCache, writeCached } from "./response-cache.ts";
import { listingRequestPath, listingSections } from "./sections.ts";

const origin = "https://api.example.com";
const now = new Date("2026-10-26T12:00:00.000Z");

const summary: IpoSummary = {
  id: "fixture-polymers",
  slug: "fixture-polymers",
  companyName: "Fixture Polymers",
  board: "mainboard",
  status: "open",
  openDate: "2026-10-20",
  closeDate: "2026-10-28",
  allotmentDate: "2026-10-30",
  listingDate: "2026-11-03",
  gmpAmountRupees: null,
  subscriptionTotalTimes: 0,
  provenance: { sourceName: "IPO Singh", retrievedAt: "2026-10-25T12:00:00.000Z", freshness: "fresh" },
};

const issue = ipoSchema.parse({
  id: summary.id,
  slug: summary.slug,
  companyName: summary.companyName,
  board: summary.board,
  status: summary.status,
  offer: {
    priceBand: { lowRupees: 100, highRupees: 110 },
    issuePriceRupees: 100,
    issueSizeRupees: null,
    lotSizeShares: 10,
    minimumInvestmentRupees: null,
  },
  dates: { openDate: summary.openDate, closeDate: summary.closeDate, allotmentDate: null, listingDate: null },
  gmp: { amountRupees: 0, percent: 0, indicativeImpliedPriceRupees: null, observedAt: null, freshness: "fresh" },
  subscription: { retailTimes: 0, qibTimes: null, niiTimes: null, employeeTimes: null, totalTimes: 0, observedAt: null, freshness: "fresh" },
  financials: [],
  registrar: null,
  documents: [],
  listing: null,
  provenance: summary.provenance,
});

function page(items: IpoSummary[]) {
  return { items, page: { limit: 20, nextCursor: null, totalCount: items.length } };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("an empty filtered page stays empty and an allotment row is kept", async () => {
  const urls: string[] = [];
  const client = createCatalogueClient(memoryJsonCache());
  const open = listingSections("mainboard")[0]!;
  const empty = await client.loadListing("mainboard", open, undefined, {
    origin,
    offline: false,
    now,
    fetchImpl: async (url) => {
      urls.push(String(url));
      return json(page([]));
    },
  });
  assert.equal(urls[0], `${origin}${listingRequestPath("mainboard", open)}`);
  assert.equal(empty.status, "ready");
  if (empty.status === "ready") assert.deepEqual(empty.items, []);

  const closed = listingSections("mainboard")[2]!;
  const allotment = await client.loadListing("mainboard", closed, undefined, {
    origin,
    offline: false,
    now,
    fetchImpl: async (url) => {
      assert.equal(String(url).includes("status=closed"), true);
      assert.equal(String(url).includes("ipoguru"), false);
      return json(
        page([
          {
            ...summary,
            status: "allotment",
            openDate: "2026-10-10",
            closeDate: "2026-10-12",
            allotmentDate: "2026-10-20",
            listingDate: "2026-10-30",
          },
        ]),
      );
    },
  });
  assert.equal(allotment.status, "ready");
  if (allotment.status === "ready") assert.equal(allotment.items[0]?.status, "allotment");
});

test("offline mode reads the saved page and does not call the network", async () => {
  const store = memoryJsonCache();
  const section = listingSections("sme")[0]!;
  const path = listingRequestPath("sme", section);
  await writeCached(store, listCacheKey(origin, path), page([{ ...summary, board: "sme" }]), now);
  let calls = 0;
  const client = createCatalogueClient(store);
  const loaded = await client.loadListing("sme", section, undefined, {
    origin,
    offline: true,
    now,
    fetchImpl: async () => {
      calls += 1;
      return json(page([]));
    },
  });
  assert.equal(calls, 0);
  assert.equal(loaded.status, "ready");
  if (loaded.status !== "ready") return;
  assert.equal(loaded.source, "cache");
  assert.equal(loaded.cacheReason, "offline");
  assert.equal(loaded.items[0]?.board, "sme");
  assert.equal(loaded.items[0]?.gmpAmountRupees, null);
  assert.match(
    boardListNotice([{ phase: "ready", message: null, cacheReason: "offline", cacheNote: null }]) ?? "",
    /offline.*last saved list.*may not be current/i,
  );
});

test("a fresh saved page is reused until refresh, and concurrent list and issue reads share one request", async () => {
  const store = memoryJsonCache();
  const section = listingSections("mainboard")[0]!;
  let listCalls = 0;
  const client = createCatalogueClient(store);
  const request = {
    origin,
    offline: false,
    now,
    fetchImpl: async () => {
      listCalls += 1;
      return json(page([summary]));
    },
  };
  await client.loadListing("mainboard", section, undefined, request);
  await client.loadListing("mainboard", section, undefined, request);
  assert.equal(listCalls, 1);
  await client.loadListing("mainboard", section, undefined, { ...request, force: true });
  assert.equal(listCalls, 2);

  let listFlightCalls = 0;
  let releaseList: (response: Response) => void = () => undefined;
  const listGate = new Promise<Response>((resolve) => {
    releaseList = resolve;
  });
  const listClient = createCatalogueClient(memoryJsonCache());
  const listRequest = {
    origin,
    offline: false,
    now,
    fetchImpl: () => {
      listFlightCalls += 1;
      return listGate;
    },
  };
  const listFirst = listClient.loadListing("mainboard", section, undefined, listRequest);
  const listSecond = listClient.loadListing("mainboard", section, undefined, listRequest);
  releaseList(json(page([summary])));
  const [listLeft, listRight] = await Promise.all([listFirst, listSecond]);
  assert.equal(listFlightCalls, 1);
  assert.equal(listLeft.status, "ready");
  assert.equal(listRight.status, "ready");

  let issueCalls = 0;
  let release: (response: Response) => void = () => undefined;
  const gate = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const issueClient = createCatalogueClient(memoryJsonCache());
  const first = issueClient.loadIssue(issue.slug, {
    origin,
    offline: false,
    now,
    fetchImpl: () => {
      issueCalls += 1;
      return gate;
    },
  });
  const second = issueClient.loadIssue(issue.slug, {
    origin,
    offline: false,
    now,
    fetchImpl: () => {
      issueCalls += 1;
      return gate;
    },
  });
  release(json(issue));
  const [left, right] = await Promise.all([first, second]);
  assert.equal(issueCalls, 1);
  assert.equal(left.status, "ready");
  assert.equal(right.status, "ready");
  if (left.status === "ready") assert.equal(left.ipo.gmp?.amountRupees, 0);
});

test("a malformed issue and a missing issue do not become sample companies", async () => {
  const client = createCatalogueClient(memoryJsonCache());
  const malformed = await client.loadIssue("fixture-polymers", {
    origin,
    offline: false,
    now,
    fetchImpl: async (url) => {
      assert.equal(String(url), `${origin}/api/v1/ipos/fixture-polymers`);
      return json({ companyName: "Sample Co" });
    },
  });
  assert.equal(malformed.status, "unavailable");

  const missing = await client.loadIssue("fixture-polymers", {
    origin,
    offline: false,
    now,
    force: true,
    fetchImpl: async () => json({ message: "IPO not found." }, 404),
  });
  assert.equal(missing.status, "missing");
  assert.equal(await issueCacheKey(origin, "fixture-polymers").includes("Sample"), false);
});

test("detail reads stay within the requested limit", async () => {
  let active = 0;
  let peak = 0;
  await eachLimited([1, 2, 3, 4, 5], 2, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  });
  assert.equal(peak, 2);
});
