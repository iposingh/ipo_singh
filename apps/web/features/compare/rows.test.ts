import assert from "node:assert/strict";
import test from "node:test";
import type { Ipo } from "@ipo-singh/contracts";
import { buildCompareRows, type CompareColumn } from "./rows.ts";

function issue(overrides: Partial<Ipo> & Pick<Ipo, "slug" | "companyName">): Ipo {
  return {
    id: overrides.slug,
    board: "mainboard",
    status: "open",
    offer: {
      priceBand: { lowRupees: 100, highRupees: 110 },
      issuePriceRupees: 100,
      issueSizeRupees: 1_000_000,
      lotSizeShares: 10,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: "2026-10-01", closeDate: "2026-10-03", allotmentDate: null, listingDate: null },
    gmp: {
      amountRupees: 10,
      percent: 10,
      indicativeImpliedPriceRupees: 110,
      observedAt: "2026-10-02T04:30:00.000Z",
      freshness: "fresh",
    },
    subscription: {
      retailTimes: 1,
      qibTimes: 2,
      niiTimes: null,
      employeeTimes: null,
      totalTimes: 3,
      observedAt: "2026-10-02T04:30:00.000Z",
      freshness: "fresh",
    },
    financials: [{ fiscalYearLabel: "FY24", revenueRupees: 500, profitAfterTaxRupees: 40, earningsPerShareRupees: 2 }],
    registrar: null,
    documents: [],
    listing: null,
    provenance: { sourceName: "IPO Singh", retrievedAt: "2026-10-02T05:00:00.000Z", freshness: "fresh" },
    ...overrides,
  };
}

function column(ipo: Ipo | null, slug = "missing-mills"): CompareColumn {
  return ipo ? { state: "stored", ipo } : { state: "missing", slug };
}

test("differences are marked and missing values stay distinct from zero", () => {
  const left = issue({ slug: "left-mills", companyName: "Left Mills" });
  const right = issue({
    slug: "right-mills",
    companyName: "Right Mills",
    board: "sme",
    gmp: {
      amountRupees: 0,
      percent: 0,
      indicativeImpliedPriceRupees: 100,
      observedAt: "2026-10-02T04:30:00.000Z",
      freshness: "fresh",
    },
    subscription: {
      retailTimes: 0,
      qibTimes: null,
      niiTimes: null,
      employeeTimes: 0,
      totalTimes: 0,
      observedAt: null,
      freshness: "missing",
      categories: [{ key: "FII", times: 1.5, subcategories: [{ key: "MF", times: 0 }] }],
    },
    financials: [{ fiscalYearLabel: "FY24", revenueRupees: null, profitAfterTaxRupees: 40, earningsPerShareRupees: 2 }],
    listing: { issuePriceRupees: 100, listingPriceRupees: 120, gainPercent: 1, listedOn: "2026-10-08" },
    dates: { openDate: "2026-10-01", closeDate: "2026-10-03", allotmentDate: null, listingDate: "2026-10-08" },
  });
  const rows = buildCompareRows([column(left), column(right)]);
  const byId = new Map(rows.map((item) => [item.id, item]));
  assert.equal(byId.get("company")?.differs, false);
  assert.equal(byId.get("board")?.differs, true);
  assert.equal(byId.get("gmp")?.differs, true);
  assert.equal(byId.get("gmp")?.cells[1]?.comparable, "0:0");
  assert.equal(byId.get("subscription-total")?.differs, true);
  assert.equal(byId.get("subscription-retail")?.cells[1]?.comparable, "0");
  assert.equal(byId.get("subscription-employee")?.cells[0]?.comparable, "missing");
  assert.equal(byId.get("subscription-employee")?.cells[1]?.comparable, "0");
  assert.equal(byId.get("subscription-FII")?.cells[1]?.comparable, "1.5");
  assert.equal(byId.get("subscription-FII:MF")?.cells[1]?.comparable, "0");
  assert.equal(byId.get("revenue:FY24")?.differs, true);
  assert.equal(byId.get("profit:FY24")?.differs, false);
  assert.equal(byId.get("listing-gain")?.cells[0]?.comparable, "missing");
  assert.equal(byId.get("listing-gain")?.cells[1]?.comparable, "20");
  assert.equal(rows.some((item) => /score|winner|recommend/i.test(`${item.id} ${item.label}`)), false);
  assert.equal(byId.has("subscription-nii"), false);
});

test("a missing issue stays unavailable and does not copy the other issue", () => {
  const rows = buildCompareRows([column(issue({ slug: "left-mills", companyName: "Left Mills" })), column(null, "gone-mills")]);
  const company = rows.find((item) => item.id === "company");
  assert.equal(company?.cells[1]?.display.type, "missing-name");
  if (company?.cells[1]?.display.type === "missing-name") assert.equal(company.cells[1].display.slug, "gone-mills");
  const gmp = rows.find((item) => item.id === "gmp");
  assert.equal(gmp?.cells[1]?.comparable, "missing");
  assert.equal(gmp?.differs, true);
  assert.equal(rows.find((item) => item.id === "issue-size")?.cells[0]?.comparable, "1000000");
});
