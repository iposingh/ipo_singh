import assert from "node:assert/strict";
import test from "node:test";
import { ipoSchema, type Ipo } from "@ipo-singh/contracts";
import { formatGmp, formatInr } from "@ipo-singh/core";
import { currentGmpPercent, listingCardLabel, offerFacts, summaryFromIpo } from "./facts.ts";

const provenance = { sourceName: "IPO Singh", retrievedAt: "2026-10-25T12:00:00.000Z", freshness: "fresh" as const };

function storedIpo(patch: Partial<Ipo> = {}): Ipo {
  return ipoSchema.parse({
    id: "fixture-polymers",
    slug: "fixture-polymers",
    companyName: "Fixture Polymers",
    board: "mainboard",
    status: "open",
    offer: {
      priceBand: { lowRupees: null, highRupees: null },
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: null,
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

test("missing offer fields stay unavailable and a zero GMP stays zero", () => {
  const missing = offerFacts(storedIpo());
  assert.equal(missing.priceBand, "Unavailable");
  assert.equal(missing.lotSize, "Unavailable");
  assert.equal(missing.minimumInvestment, "Unavailable");
  assert.equal(missing.gmp.value, "GMP unavailable");
  assert.equal(missing.updated, "Last updated: Unavailable");

  const zero = storedIpo({
    offer: {
      priceBand: { lowRupees: 0, highRupees: 100 },
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: 0,
      minimumInvestmentRupees: 0,
    },
    gmp: { amountRupees: 0, percent: 0, indicativeImpliedPriceRupees: null, observedAt: "2026-10-25T09:00:00.000Z", freshness: "stale" },
    subscription: {
      retailTimes: 0,
      qibTimes: null,
      niiTimes: null,
      employeeTimes: null,
      totalTimes: 0,
      observedAt: null,
      freshness: "fresh",
    },
  });
  const facts = offerFacts(zero);
  assert.match(facts.priceBand, /₹0/);
  assert.match(facts.priceBand, /₹100/);
  assert.equal(facts.lotSize, "0 shares");
  assert.equal(facts.minimumInvestment, formatInr(0));
  assert.equal(facts.gmp.value, formatGmp(0, 0));
  assert.equal(facts.gmp.value.includes("unavailable"), false);
  assert.match(facts.updated, /IST/);
  const summary = summaryFromIpo(zero);
  assert.equal(summary.gmpAmountRupees, 0);
  assert.equal(summary.subscriptionTotalTimes, 0);
});

test("a missing stored percent is calculated from the issue price", () => {
  const ipo = storedIpo({
    offer: {
      priceBand: { lowRupees: 100, highRupees: 110 },
      issuePriceRupees: 100,
      issueSizeRupees: null,
      lotSizeShares: 10,
      minimumInvestmentRupees: null,
    },
    gmp: { amountRupees: 25, percent: null, indicativeImpliedPriceRupees: null, observedAt: null, freshness: "fresh" },
  });
  assert.equal(currentGmpPercent(ipo), 25);
  assert.equal(offerFacts(ipo).gmp.value, formatGmp(25, 25));
  assert.equal(offerFacts(ipo).minimumInvestment, formatInr(1000));
  const label = listingCardLabel({
    companyName: ipo.companyName,
    board: ipo.board,
    status: ipo.status,
    openDate: ipo.dates.openDate,
    closeDate: ipo.dates.closeDate,
    facts: offerFacts(ipo),
    detailState: "ready",
  });
  assert.match(label, /Fixture Polymers/);
  assert.match(label, /Shows the stored IPO/);
});
