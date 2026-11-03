import assert from "node:assert/strict";
import test from "node:test";
import type { Ipo, IpoSummary } from "@ipo-singh/contracts";
import { loadIpoDocuments, loadSearchSummaries } from "../../lib/api/ipo-singh.ts";

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

function ipo(): Ipo {
  return {
    id: summary.id,
    slug: summary.slug,
    companyName: summary.companyName,
    board: "mainboard",
    status: "open",
    offer: {
      priceBand: { lowRupees: 100, highRupees: 110 },
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: null,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: "2026-10-01", closeDate: "2026-10-03", allotmentDate: null, listingDate: null },
    gmp: null,
    subscription: null,
    financials: [],
    registrar: null,
    documents: [],
    listing: null,
    provenance: summary.provenance,
  };
}

test("loads each selected IPO once and keeps a missing slug empty", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/api/v1/ipos/stored-mills")) return Response.json(ipo());
    if (url.endsWith("/api/v1/ipos/other-mills")) return Response.json({ ...ipo(), id: "other-mills", slug: "other-mills", companyName: "Other Mills" });
    return new Response(null, { status: 404 });
  };
  const loaded = await loadIpoDocuments(["stored-mills", "stored-mills", "gone-mills", "other-mills"], {
    origin: "http://127.0.0.1:4000",
    fetch: fetchImpl,
  });
  assert.equal(loaded.status, "ready");
  if (loaded.status === "ready") {
    assert.deepEqual(
      loaded.ipos.map((item) => item?.slug ?? null),
      ["stored-mills", null, "other-mills"],
    );
  }
  assert.equal(urls.filter((url) => url.endsWith("/api/v1/ipos/stored-mills")).length, 1);
  assert.equal(urls.some((url) => url.includes("/gmp") || url.includes("/subscription")), false);
});

test("search suggestions stay on summaries", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    return Response.json({ items: [summary], page: { limit: 20, nextCursor: null, totalCount: 1 } });
  };
  const found = await loadSearchSummaries("mills", { origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  assert.equal(found.status, "ready");
  if (found.status === "ready") assert.equal(found.items[0]?.slug, "stored-mills");
  const short = await loadSearchSummaries("m", { origin: "http://127.0.0.1:4000", fetch: fetchImpl });
  assert.equal(short.status, "short");
  assert.equal(urls.length, 1);
  assert.equal(urls[0]?.includes("/api/v1/search?"), true);
  assert.equal(urls.some((url) => url.includes("/api/v1/ipos/")), false);
});
