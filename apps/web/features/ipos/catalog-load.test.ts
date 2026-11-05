import assert from "node:assert/strict";
import test from "node:test";
import type { Ipo, IpoSummary } from "@ipo-singh/contracts";
import { loadBoardCatalog, loadCalendarCatalog, loadDetailCatalog, loadListedCatalog, loadListingSummaries, loadSearchCatalog, loadSearchSummaries, loadSitemapCatalog, ipoSinghApiOrigin } from "../../lib/api/ipo-singh.ts";

const summary: IpoSummary = {
  id: "stored-mills",
  slug: "stored-mills",
  companyName: "Stored Mills",
  board: "mainboard",
  status: "open",
  openDate: "2026-10-01",
  closeDate: "2026-10-03",
  gmpAmountRupees: null,
  subscriptionTotalTimes: null,
  provenance: { sourceName: "IPO Singh", retrievedAt: null, freshness: "missing" },
};

function ipo(board: Ipo["board"] = "mainboard"): Ipo {
  return {
    id: summary.id,
    slug: summary.slug,
    companyName: summary.companyName,
    board,
    status: summary.status,
    offer: {
      priceBand: { lowRupees: 100, highRupees: 110 },
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: null,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: "2026-10-01", closeDate: "2026-10-03", allotmentDate: null, listingDate: "2026-10-08" },
    gmp: null,
    subscription: null,
    financials: [],
    registrar: null,
    documents: [],
    listing: null,
    provenance: summary.provenance,
  };
}

test("refuses an IPO Guru origin before calling it", async () => {
  let calls = 0;
  const loaded = await loadBoardCatalog("mainboard", {
    origin: "https://www.ipoguru.in/api/v2",
    fetch: async () => {
      calls += 1;
      throw new Error("vendor was called");
    },
  });
  assert.equal(ipoSinghApiOrigin("https://api.ipoguru.in"), null);
  assert.equal(ipoSinghApiOrigin(undefined, "development")?.origin, "http://127.0.0.1:4000");
  assert.equal(ipoSinghApiOrigin(undefined, "production"), null);
  assert.equal(ipoSinghApiOrigin("http://127.0.0.1:4000", "production"), null);
  assert.equal(ipoSinghApiOrigin("https://random.trycloudflare.com", "production"), null);
  assert.equal(ipoSinghApiOrigin("https://api.example.com", "production")?.origin, "https://api.example.com");
  assert.equal(loaded.status, "unavailable");
  assert.deepEqual(loaded.ipos, []);
  assert.equal(calls, 0);
});

test("loads a board from IPO Singh and leaves an empty catalogue empty", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/api/v1/ipos?board=mainboard&limit=100")) {
      return Response.json({
        items: [summary],
        page: { limit: 100, nextCursor: null, totalCount: 1 },
      });
    }
    if (url.endsWith("/api/v1/ipos?board=sme&limit=100")) {
      return Response.json({ items: [], page: { limit: 100, nextCursor: null, totalCount: 0 } });
    }
    if (url.endsWith("/api/v1/ipos/stored-mills")) return Response.json(ipo());
    return new Response(null, { status: 404 });
  };
  const mainboard = await loadBoardCatalog("mainboard", { origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  assert.equal(mainboard.status, "ready");
  assert.equal(mainboard.ipos[0]?.companyName, "Stored Mills");
  assert.equal(mainboard.ipos[0]?.offer.priceBand.lowRupees, 100);
  const sme = await loadBoardCatalog("sme", { origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  assert.equal(sme.status, "ready");
  assert.deepEqual(sme.ipos, []);
  assert.equal(urls.some((url) => url.includes("ipoguru.in")), false);
  assert.equal(urls.filter((url) => url.includes("/api/v1/ipos/stored-mills")).length, 1);
});

test("loads one GMP history for the detail page and none for the board list", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/api/v1/ipos?board=mainboard&limit=100")) {
      return Response.json({ items: [summary, { ...summary, id: "other-mills", slug: "other-mills" }], page: { limit: 100, nextCursor: null, totalCount: 2 } });
    }
    if (url.endsWith("/api/v1/ipos/stored-mills") || url.endsWith("/api/v1/ipos/other-mills")) return Response.json(ipo());
    if (url.endsWith("/gmp/history")) {
      return Response.json({
        ipoId: "stored-mills",
        observations: [],
        window: { high: null, low: null, truncated: false, timelineLocked: true },
        provenance: { sourceName: "IPO Guru Pro", retrievedAt: "2026-08-31T05:18:02.000Z", freshness: "fresh" },
      });
    }
    if (url.endsWith("/subscription/history")) {
      return Response.json({
        ipoId: "stored-mills",
        observations: [],
        provenance: { sourceName: "IPO Singh", retrievedAt: null, freshness: "missing" },
      });
    }
    return new Response(null, { status: 404 });
  };
  const board = await loadBoardCatalog("mainboard", { origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  assert.equal(board.status, "ready");
  assert.equal(urls.some((url) => url.includes("/gmp/history")), false);
  assert.equal(urls.some((url) => url.includes("/subscription")), false);
  const detail = await loadDetailCatalog("stored-mills", { origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  assert.equal(detail.status, "ready");
  if (detail.status === "ready") {
    assert.equal(detail.gmpHistoryStatus, "ready");
    assert.equal(detail.gmpHistoryWindow?.timelineLocked, true);
    assert.equal(detail.gmpHistory.length, 0);
    assert.equal(detail.subscriptionHistoryStatus, "ready");
  }
  assert.equal(urls.filter((url) => url.includes("/gmp/history")).length, 1);
  assert.equal(urls.filter((url) => url.includes("/subscription/history")).length, 1);
  assert.equal(urls.some((url) => url.includes("ipoguru.in")), false);

  const failed = await loadDetailCatalog("stored-mills", {
    origin: "http://127.0.0.1:4000",
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith("/gmp/history")) return new Response(null, { status: 503 });
      if (url.endsWith("/subscription/history")) {
        return Response.json({
          ipoId: "stored-mills",
          observations: [],
          provenance: { sourceName: "IPO Singh", retrievedAt: null, freshness: "missing" },
        });
      }
      if (url.endsWith("/api/v1/ipos/stored-mills")) return Response.json(ipo());
      return new Response(null, { status: 404 });
    },
  });
  assert.equal(failed.status, "ready");
  if (failed.status === "ready") assert.equal(failed.gmpHistoryStatus, "unavailable");

  const subscriptionFailed = await loadDetailCatalog("stored-mills", {
    origin: "http://127.0.0.1:4000",
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith("/subscription/history")) return new Response(null, { status: 503 });
      if (url.endsWith("/gmp/history")) {
        return Response.json({
          ipoId: "stored-mills",
          observations: [],
          window: { high: null, low: null, truncated: false, timelineLocked: true },
          provenance: { sourceName: "IPO Guru Pro", retrievedAt: "2026-08-31T05:18:02.000Z", freshness: "fresh" },
        });
      }
      if (url.endsWith("/api/v1/ipos/stored-mills")) return Response.json(ipo());
      return new Response(null, { status: 404 });
    },
  });
  assert.equal(subscriptionFailed.status, "ready");
  if (subscriptionFailed.status === "ready") {
    assert.equal(subscriptionFailed.subscriptionHistoryStatus, "unavailable");
    assert.equal(subscriptionFailed.ipo.companyName, "Stored Mills");
  }
});

test("searches IPO Singh and does not download both catalogues", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/api/v1/search?")) {
      return Response.json({
        items: [{ ...summary, board: "sme" }],
        page: { limit: 20, nextCursor: null, totalCount: 1 },
      });
    }
    if (url.endsWith("/api/v1/ipos/stored-mills")) return Response.json(ipo("sme"));
    return new Response(null, { status: 404 });
  };
  const short = await loadSearchCatalog("a", { origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  assert.equal(short.status, "short");
  const found = await loadSearchCatalog("stored", { origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  assert.equal(found.status, "ready");
  if (found.status === "ready") {
    assert.equal(found.ipos[0]?.board, "sme");
    assert.equal(found.truncated, false);
  }
  const vendor = await loadSearchCatalog("stored", { origin: "https://www.ipoguru.in/api/v2", fetch: fetchImpl });
  assert.equal(vendor.status, "unavailable");
  assert.equal(urls.some((url) => url.includes("/api/v1/ipos?board=")), false);
  assert.equal(urls.some((url) => url.includes("ipoguru.in")), false);
  assert.equal(urls.filter((url) => url.includes("/api/v1/search?")).length, 1);
});

test("search reads one server page and does not follow the cursor", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/api/v1/search?")) {
      return Response.json({
        items: [{ ...summary, board: "sme" }],
        page: { limit: 20, nextCursor: "Mg", totalCount: 40 },
      });
    }
    if (url.endsWith("/api/v1/ipos/stored-mills")) return Response.json(ipo("sme"));
    return new Response(null, { status: 404 });
  };
  const found = await loadSearchCatalog(
    { q: "a&b", board: "sme", status: "open", from: "2026-10-01", to: "2026-10-03", cursor: "MTA" },
    { origin: "http://127.0.0.1:4000", fetch: fetchImpl },
  );
  assert.equal(found.status, "ready");
  if (found.status === "ready") {
    assert.equal(found.truncated, true);
    assert.equal(found.nextCursor, "Mg");
    assert.equal(found.totalCount, 40);
    assert.equal(found.ipos[0]?.board, "sme");
  }
  assert.equal(urls.filter((url) => url.includes("/api/v1/search?")).length, 1);
  const requested = new URL(urls.find((url) => url.includes("/api/v1/search?")) ?? "");
  assert.equal(requested.searchParams.get("q"), "a&b");
  assert.equal(requested.searchParams.get("board"), "sme");
  assert.equal(requested.searchParams.get("status"), "open");
  assert.equal(requested.searchParams.get("from"), "2026-10-01");
  assert.equal(requested.searchParams.get("cursor"), "MTA");
  assert.equal(urls.filter((url) => url.endsWith("/api/v1/ipos/stored-mills")).length, 1);
});

test("search does not send disallowed text or an inverted date range", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(null, { status: 500 });
  };
  const markup = await loadSearchCatalog("<script>", { origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  const inverted = await loadSearchCatalog(
    { q: "stored", from: "2026-10-03", to: "2026-10-01" },
    { origin: "http://127.0.0.1:4000", fetch: fetchImpl },
  );
  assert.equal(markup.status, "invalid");
  assert.equal(inverted.status, "invalid");
  assert.equal(calls, 0);
});

test("suggestion search requests one short page", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    return Response.json({
      items: [summary],
      page: { limit: 8, nextCursor: "Mg", totalCount: 40 },
    });
  };
  const found = await loadSearchSummaries("stored", { origin: "http://127.0.0.1:4000", fetch: fetchImpl }, { limit: 8, maxPages: 1, board: "sme" });
  assert.equal(found.status, "ready");
  assert.equal(urls.length, 1);
  const requested = new URL(urls[0] ?? "");
  assert.equal(requested.searchParams.get("limit"), "8");
  assert.equal(requested.searchParams.get("board"), "sme");
  assert.equal(urls.some((url) => url.includes("/api/v1/ipos/")), false);
});

test("loads calendar dates from IPO Singh and keeps an empty calendar empty", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/api/v1/calendar?")) {
      return Response.json({
        items: [
          {
            date: "2026-10-01",
            event: "open",
            ipo: summary,
          },
        ],
        page: { limit: 100, nextCursor: null, totalCount: 1 },
      });
    }
    return new Response(null, { status: 503 });
  };
  const loaded = await loadCalendarCatalog({ origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  assert.equal(loaded.status, "ready");
  if (loaded.status === "ready") {
    assert.equal(loaded.entries[0]?.event, "open");
    assert.equal(loaded.entries[0]?.ipo.board, "mainboard");
    assert.equal(loaded.truncated, false);
  }
  const failed = await loadCalendarCatalog({
    origin: "http://127.0.0.1:4000",
    fetch: async () => new Response(null, { status: 503 }),
  });
  assert.equal(failed.status, "unavailable");
  const vendor = await loadCalendarCatalog({ origin: "https://api.ipoguru.in", fetch: fetchImpl });
  assert.equal(vendor.status, "unavailable");
  assert.equal(urls.some((url) => url.includes("ipoguru.in")), false);
});

test("requests one calendar month and board from IPO Singh", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    return Response.json({ items: [], page: { limit: 100, nextCursor: null, totalCount: 0 } });
  };
  const loaded = await loadCalendarCatalog(
    { origin: "http://127.0.0.1:4000", fetch: fetchImpl },
    { board: "sme", from: "2026-10-01", to: "2026-10-31" },
  );
  assert.equal(loaded.status, "ready");
  assert.equal(urls[0]?.includes("/api/v1/calendar?"), true);
  assert.equal(urls[0]?.includes("board=sme"), true);
  assert.equal(urls[0]?.includes("from=2026-10-01"), true);
  assert.equal(urls[0]?.includes("to=2026-10-31"), true);
  assert.equal(urls.some((url) => url.includes("ipoguru.in")), false);
});

test("loads listed issues from summaries without hydrating detail documents", async () => {
  const urls: string[] = [];
  const listedSummary = {
    ...summary,
    status: "listed" as const,
    listingDate: "2026-10-08",
    listingPriceRupees: 120,
    listingIssuePriceRupees: 100,
    issuePriceRupees: 100,
    listingGainPercent: 20,
    cmpRupees: 130,
    currentGainPercent: 8.33,
  };
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/api/v1/ipos?")) {
      return Response.json({ items: [listedSummary], page: { limit: 100, nextCursor: null, totalCount: 1 } });
    }
    if (url.includes("/api/v1/ipos/stored-mills")) {
      throw new Error("listed catalogue must not hydrate detail documents");
    }
    return new Response(null, { status: 404 });
  };
  const loaded = await loadListedCatalog({ origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  assert.equal(loaded.status, "ready");
  if (loaded.status === "ready") {
    assert.equal(loaded.ipos[0]?.status, "listed");
    assert.equal(loaded.ipos[0]?.listingPriceRupees, 120);
    assert.equal(loaded.ipos[0]?.listingIssuePriceRupees, 100);
    assert.equal(loaded.ipos[0]?.listingGainPercent, 20);
    assert.equal(loaded.ipos[0]?.cmpRupees, 130);
    assert.equal(loaded.ipos[0]?.currentGainPercent, 8.33);
    assert.equal(loaded.truncated, false);
  }
  assert.equal(urls.some((url) => url.includes("status=listed")), true);
  assert.equal(urls.some((url) => /\/api\/v1\/ipos\/[^?]+$/.test(url)), false);
  assert.equal(urls.some((url) => url.includes("/gmp")), false);
  assert.equal(urls.some((url) => url.includes("ipoguru.in")), false);
});

test("listed catalogue paginates summaries without detail calls across pages", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("cursor=")) {
      return Response.json({
        items: [{ ...summary, id: "listed-b", slug: "listed-b", status: "listed" as const, listingDate: "2026-09-01" }],
        page: { limit: 100, nextCursor: null, totalCount: 2 },
      });
    }
    return Response.json({
      items: [{ ...summary, id: "listed-a", slug: "listed-a", status: "listed" as const, listingDate: "2026-10-01" }],
      page: { limit: 100, nextCursor: "Mg", totalCount: 2 },
    });
  };
  const loaded = await loadListedCatalog({ origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  assert.equal(loaded.status, "ready");
  if (loaded.status === "ready") {
    assert.deepEqual(
      loaded.ipos.map((item) => item.slug),
      ["listed-a", "listed-b"],
    );
  }
  assert.equal(urls.length, 2);
  assert.equal(urls.every((url) => url.includes("/api/v1/ipos?")), true);
});

test("reports an API failure instead of substituting issues", async () => {
  const loaded = await loadBoardCatalog("mainboard", {
    origin: "http://127.0.0.1:4000",
    fetch: async () => new Response(null, { status: 503 }),
  });
  assert.equal(loaded.status, "unavailable");
  assert.deepEqual(loaded.ipos, []);
});

test("sitemap reads catalogue summaries and does not open each IPO", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/api/v1/ipos?limit=100")) {
      return Response.json({
        items: [{ ...summary, provenance: { ...summary.provenance, retrievedAt: "2026-10-02T00:00:00.000Z" } }, summary],
        page: { limit: 100, nextCursor: null, totalCount: 1 },
      });
    }
    return new Response(null, { status: 404 });
  };
  const loaded = await loadSitemapCatalog({ origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  assert.equal(loaded.status, "ready");
  if (loaded.status === "ready") {
    assert.deepEqual(loaded.issues, [{ slug: "stored-mills", updatedAt: "2026-10-02T00:00:00.000Z" }]);
    assert.equal(loaded.truncated, false);
  }
  assert.equal(urls.length, 1);
  assert.equal(urls.some((url) => url.includes("/api/v1/ipos/")), false);
  assert.equal(urls.some((url) => url.includes("ipoguru.in")), false);
});

test("a listing page requests one summary page and skips one invalid card", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    return Response.json({
      items: [summary, { companyName: "Broken" }, { ...summary, id: "other-mills", slug: "other-mills", board: "sme" }],
      page: { limit: 20, nextCursor: null, totalCount: 2 },
    });
  };
  const loaded = await loadListingSummaries(
    { board: "mainboard", status: "open", q: "Mills", sort: "close", direction: "desc", page: 2, limit: 20 },
    { origin: "http://127.0.0.1:4000", fetch: fetchImpl },
  );
  assert.equal(loaded.status, "ready");
  assert.equal(loaded.totalCount, 2);
  assert.deepEqual(loaded.items.map((item) => item.slug), ["stored-mills"]);
  assert.equal(urls.length, 1);
  assert.match(urls[0] ?? "", /\/api\/v1\/ipos\?/);
  assert.equal(urls.some((url) => /\/api\/v1\/ipos\/[^?]+/.test(url)), false);
  assert.match(urls[0] ?? "", /cursor=/);
  assert.match(urls[0] ?? "", /status=open/);
});

test("a failed listing request is not reported as an empty catalogue", async () => {
  const offline = await loadListingSummaries(
    { board: "sme" },
    {
      origin: "http://127.0.0.1:4000",
      fetch: async () => {
        throw new Error("offline");
      },
    },
  );
  assert.equal(offline.status, "backend");
  assert.deepEqual(offline.items, []);
  const database = await loadListingSummaries(
    { board: "sme" },
    { origin: "http://127.0.0.1:4000", fetch: async () => new Response(null, { status: 503 }) },
  );
  assert.equal(database.status, "database");
});
