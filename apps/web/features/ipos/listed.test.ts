import assert from "node:assert/strict";
import test from "node:test";
import type { Ipo } from "@ipo-singh/contracts";
import { actualListingPerformance, arrangeListed, listedPath, parseListedQuery } from "./listed.ts";

function listed(overrides: Partial<Ipo> & Pick<Ipo, "slug" | "companyName">): Ipo {
  return {
    id: overrides.slug,
    board: "mainboard",
    status: "listed",
    offer: {
      priceBand: { lowRupees: 90, highRupees: 100 },
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: null,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: "2026-08-01", closeDate: "2026-08-04", allotmentDate: null, listingDate: "2026-08-10" },
    gmp: {
      amountRupees: 40,
      percent: 40,
      indicativeImpliedPriceRupees: 140,
      observedAt: "2026-08-04T10:00:00.000Z",
      freshness: "fresh",
    },
    subscription: null,
    financials: [],
    registrar: null,
    documents: [],
    listing: null,
    provenance: { sourceName: "IPO Singh", retrievedAt: null, freshness: "missing" },
    ...overrides,
  };
}

test("listing performance uses the actual prices and ignores GMP", () => {
  const gained = actualListingPerformance(
    listed({
      slug: "gained",
      companyName: "Gained Mills",
      listing: { issuePriceRupees: 100, listingPriceRupees: 120, gainPercent: 1, listedOn: "2026-08-10" },
      profile: {
        refundDate: null,
        dematCreditDate: null,
        about: null,
        description: null,
        strengths: [],
        risks: [],
        promoters: [],
        objectsOfIssue: { items: [], text: null },
        sourceFinancials: { unit: null, headers: [], rows: [], text: null },
        cmpRupees: 130,
        currentGainPercent: 8.33,
      },
    }),
  );
  assert.equal(gained.issuePriceRupees, 100);
  assert.equal(gained.listingPriceRupees, 120);
  assert.equal(gained.gainPercent, 20);
  assert.equal(gained.currentPriceRupees, 130);
  assert.equal(gained.sinceListingPercent, 8.33);

  const loss = actualListingPerformance(
    listed({
      slug: "loss",
      companyName: "Loss Mills",
      offer: {
        priceBand: { lowRupees: null, highRupees: null },
        issuePriceRupees: 200,
        issueSizeRupees: null,
        lotSizeShares: null,
        minimumInvestmentRupees: null,
      },
      listing: { issuePriceRupees: null, listingPriceRupees: 150, gainPercent: null, listedOn: null },
    }),
  );
  assert.equal(loss.issuePriceRupees, 200);
  assert.equal(loss.gainPercent, -25);

  const missing = actualListingPerformance(listed({ slug: "missing", companyName: "Missing Mills" }));
  assert.equal(missing.listingPriceRupees, null);
  assert.equal(missing.gainPercent, null);
  assert.equal(missing.currentPriceRupees, null);
  assert.equal(missing.issuePriceRupees, 100);

  const flat = actualListingPerformance(
    listed({
      slug: "flat",
      companyName: "Flat Mills",
      listing: { issuePriceRupees: 80, listingPriceRupees: 80, gainPercent: 9, listedOn: "2026-08-10" },
      profile: {
        refundDate: null,
        dematCreditDate: null,
        about: null,
        description: null,
        strengths: [],
        risks: [],
        promoters: [],
        objectsOfIssue: { items: [], text: null },
        sourceFinancials: { unit: null, headers: [], rows: [], text: null },
        cmpRupees: 0,
        currentGainPercent: 0,
      },
    }),
  );
  assert.equal(flat.gainPercent, 0);
  assert.equal(flat.currentPriceRupees, 0);
  assert.equal(flat.sinceListingPercent, 0);
});

test("a stored listing gain is kept when the prices cannot be calculated", () => {
  const stored = actualListingPerformance(
    listed({
      slug: "stored-gain",
      companyName: "Stored Gain",
      listing: { issuePriceRupees: 0, listingPriceRupees: 10, gainPercent: 4.5, listedOn: "2026-08-10" },
    }),
  );
  assert.equal(stored.issuePriceRupees, 0);
  assert.equal(stored.gainPercent, 4.5);
});

test("listed history filters, sorts missing prices last, and paginates in the path", () => {
  const rows = [
    listed({ slug: "late", companyName: "Late Mills", dates: { openDate: null, closeDate: null, allotmentDate: null, listingDate: "2026-09-01" } }),
    listed({
      slug: "early",
      companyName: "Early Mills",
      board: "sme",
      dates: { openDate: null, closeDate: null, allotmentDate: null, listingDate: "2026-07-01" },
      listing: { issuePriceRupees: 50, listingPriceRupees: 40, gainPercent: null, listedOn: "2026-07-01" },
    }),
    listed({ slug: "open-issue", companyName: "Open Mills", status: "open" }),
    listed({
      slug: "undated",
      companyName: "Undated Mills",
      dates: { openDate: null, closeDate: null, allotmentDate: null, listingDate: null },
    }),
  ];
  const query = parseListedQuery({});
  assert.equal(query.direction, "desc");
  assert.deepEqual(
    arrangeListed(rows, query).map((ipo) => ipo.slug),
    ["late", "early", "undated"],
  );
  assert.deepEqual(
    arrangeListed(rows, { ...query, direction: "asc" }).map((ipo) => ipo.slug),
    ["early", "late", "undated"],
  );
  assert.deepEqual(
    arrangeListed(rows, { ...query, sort: "gain", direction: "desc" }).map((ipo) => ipo.slug),
    ["early", "late", "undated"],
  );
  assert.deepEqual(
    arrangeListed(rows, { ...query, board: "sme", q: "early" }).map((ipo) => ipo.slug),
    ["early"],
  );
  assert.equal(listedPath({ ...query, board: "sme", sort: "gain", direction: "asc", page: 2, q: "mills" }), "/ipos/listed?q=mills&board=sme&sort=gain&direction=asc&page=2");
  assert.equal(listedPath(query), "/ipos/listed");
});
