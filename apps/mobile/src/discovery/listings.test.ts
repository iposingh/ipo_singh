import assert from "node:assert/strict";
import test from "node:test";
import { loadListingsPage } from "../catalogue/load.ts";
import { listingLifecycleLabel } from "../design/copy.ts";
import {
  apiStatusForFilter,
  defaultListingsQuery,
  defaultSortForStatus,
  ipoListRequestPath,
  listingsReloadKey,
  preparedListingsQuery,
} from "./listings-query.ts";
import {
  readListingsSession,
  resetListingsSession,
  setListingsBoard,
  setListingsQueryText,
  setListingsSort,
  setListingsStatus,
} from "./listings-session.ts";

test("listings defaults to Mainboard with open-date sort and maps Allotment to closed", () => {
  assert.equal(defaultListingsQuery.board, "mainboard");
  assert.equal(defaultListingsQuery.status, "all");
  assert.deepEqual(defaultSortForStatus("all"), { sort: "open", direction: "asc" });
  assert.deepEqual(defaultSortForStatus("open"), { sort: "close", direction: "asc" });
  assert.deepEqual(defaultSortForStatus("upcoming"), { sort: "open", direction: "asc" });
  assert.deepEqual(defaultSortForStatus("allotment"), { sort: "close", direction: "desc" });
  assert.deepEqual(defaultSortForStatus("listed"), { sort: "listing", direction: "desc" });
  assert.equal(apiStatusForFilter("all"), undefined);
  assert.equal(apiStatusForFilter("open"), "open");
  assert.equal(apiStatusForFilter("allotment"), "closed");
  assert.equal(apiStatusForFilter("listed"), "listed");
  assert.equal(preparedListingsQuery("p"), null);
  assert.equal(preparedListingsQuery(" poly "), "poly");
});

test("list and search paths send board, status, sort, and pagination without inventing filters", () => {
  assert.equal(
    ipoListRequestPath({ board: "mainboard", sort: "open", direction: "asc" }),
    "/api/v1/ipos?board=mainboard&sort=open&direction=asc&limit=20",
  );
  assert.equal(
    ipoListRequestPath({ board: "sme", status: "closed", sort: "close", direction: "desc" }, "page-2"),
    "/api/v1/ipos?board=sme&status=closed&sort=close&direction=desc&limit=20&cursor=page-2",
  );
  assert.equal(
    listingsReloadKey({ board: "sme", status: "open", query: " poly ", sort: "close", direction: "asc" }),
    "sme|open|poly|close|asc",
  );
});

test("session keeps board, status, search, and sort when navigating away and back", () => {
  resetListingsSession();
  assert.deepEqual(readListingsSession(), defaultListingsQuery);
  setListingsBoard("sme");
  setListingsStatus("allotment");
  setListingsQueryText("steel");
  setListingsSort("listing", "desc");
  assert.deepEqual(readListingsSession(), {
    board: "sme",
    status: "allotment",
    query: "steel",
    sort: "listing",
    direction: "desc",
  });
  assert.equal(apiStatusForFilter(readListingsSession().status), "closed");
  resetListingsSession();
});

test("Allotment Awaited stays distinct from Allotment Out", () => {
  assert.equal(listingLifecycleLabel({ status: "closed", allotmentConfirmed: false }), "Allotment Awaited");
  assert.equal(listingLifecycleLabel({ status: "allotment", allotmentConfirmed: false }), "Allotment Awaited");
  assert.equal(listingLifecycleLabel({ status: "allotment", allotmentConfirmed: true }), "Allotment Out");
  assert.equal(listingLifecycleLabel({ status: "closed", allotmentConfirmed: true }), "Allotment Out");
  assert.equal(listingLifecycleLabel({ status: "open" }), "Open");
  assert.equal(listingLifecycleLabel({ status: "listed", allotmentConfirmed: true }), "Listed");
});

test("loadListingsPage browses summaries and searches without detail fetches", async () => {
  const origin = "https://api.example.com";
  const summary = {
    id: "fixture-polymers",
    slug: "fixture-polymers",
    companyName: "Fixture Polymers",
    board: "mainboard",
    status: "open",
    openDate: "2026-10-20",
    closeDate: "2026-10-22",
    gmpAmountRupees: null,
    subscriptionTotalTimes: 0,
    provenance: {
      sourceName: "IPO Singh",
      retrievedAt: "2026-10-25T12:00:00.000Z",
      freshness: "fresh",
    },
  };
  const urls: string[] = [];
  const browse = await loadListingsPage(
    { board: "mainboard", status: "allotment", query: "", sort: "close", direction: "desc" },
    {
      origin,
      fetchImpl: async (url) => {
        urls.push(String(url));
        return new Response(JSON.stringify({ items: [], page: { limit: 20, nextCursor: null, totalCount: 0 } }), { status: 200 });
      },
    },
  );
  assert.deepEqual(browse, { status: "ready", items: [], nextCursor: null });
  assert.equal(urls[0], `${origin}/api/v1/ipos?board=mainboard&status=closed&sort=close&direction=desc&limit=20`);
  assert.equal(urls[0]?.includes("/ipos/"), false);

  const search = await loadListingsPage(
    { board: "sme", status: "open", query: "poly", sort: "open", direction: "asc" },
    {
      origin,
      cursor: "more",
      fetchImpl: async (url) => {
        urls.push(String(url));
        return new Response(JSON.stringify({ items: [{ ...summary, board: "sme" }], page: { limit: 20, nextCursor: null, totalCount: 1 } }), {
          status: 200,
        });
      },
    },
  );
  assert.equal(search.status, "ready");
  assert.equal(
    urls[1],
    `${origin}/api/v1/search?q=poly&limit=20&board=sme&status=open&sort=open&direction=asc&cursor=more`,
  );
  if (search.status === "ready") {
    assert.equal(search.items[0]?.companyName, "Fixture Polymers");
    assert.equal(search.items[0]?.gmpAmountRupees, null);
  }
});
