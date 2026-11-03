import assert from "node:assert/strict";
import test from "node:test";
import type { Ipo } from "@ipo-singh/contracts";
import { browseIpos, matchesStatus, parseBrowseQuery } from "./browse.ts";

function issue(overrides: Partial<Ipo> & Pick<Ipo, "id" | "slug" | "companyName" | "board" | "status">): Ipo {
  return {
    offer: {
      priceBand: { lowRupees: null, highRupees: null },
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: null,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: null, closeDate: null, allotmentDate: null, listingDate: null },
    gmp: null,
    subscription: null,
    financials: [],
    registrar: null,
    documents: [],
    listing: null,
    provenance: { sourceName: "fixture", retrievedAt: null, freshness: "missing" },
    ...overrides,
  };
}

test("browse keeps an empty catalogue empty", () => {
  assert.deepEqual(browseIpos([], parseBrowseQuery({})).map((ipo) => ipo.id), []);
});

test("closed filter includes allotment and ignores issue size", () => {
  const rows = [
    issue({ id: "open", slug: "open", companyName: "Open Mills", board: "sme", status: "open", offer: { priceBand: { lowRupees: null, highRupees: null }, issuePriceRupees: null, issueSizeRupees: 5_000_000_000, lotSizeShares: null, minimumInvestmentRupees: null } }),
    issue({ id: "allotment", slug: "allotment", companyName: "Allotment Mills", board: "sme", status: "allotment" }),
    issue({ id: "listed", slug: "listed", companyName: "Listed Mills", board: "mainboard", status: "listed" }),
  ];
  assert.equal(matchesStatus("allotment", "closed"), true);
  assert.equal(matchesStatus("allotment", "allotment"), true);
  assert.equal(matchesStatus("closed", "allotment"), false);
  assert.equal(parseBrowseQuery({ status: "allotment" }).status, "allotment");
  assert.deepEqual(
    browseIpos(rows, { q: "", status: "closed", sort: "open", direction: "asc" }).map((ipo) => ipo.id),
    ["allotment"],
  );
  assert.deepEqual(
    browseIpos(rows, { q: "", status: "open", sort: "open", direction: "asc" }).map((ipo) => ipo.id),
    ["open"],
  );
});

test("search matches the company name and missing dates sort last", () => {
  const rows = [
    issue({ id: "late", slug: "late", companyName: "Later Mills", board: "mainboard", status: "upcoming", dates: { openDate: "2026-03-02", closeDate: null, allotmentDate: null, listingDate: null } }),
    issue({ id: "missing", slug: "missing", companyName: "Undated Mills", board: "mainboard", status: "upcoming" }),
    issue({ id: "early", slug: "early", companyName: "Earlier Mills", board: "mainboard", status: "upcoming", dates: { openDate: "2026-01-05", closeDate: null, allotmentDate: null, listingDate: null } }),
  ];
  assert.deepEqual(
    browseIpos(rows, { q: "mills", status: "all", sort: "open", direction: "asc" }).map((ipo) => ipo.id),
    ["early", "late", "missing"],
  );
  assert.deepEqual(
    browseIpos(rows, { q: "EARLIER", status: "all", sort: "open", direction: "desc" }).map((ipo) => ipo.id),
    ["early"],
  );
});
