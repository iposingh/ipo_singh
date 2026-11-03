import assert from "node:assert/strict";
import test from "node:test";
import { gmpDisplayFreshness, gmpDisplayStaleAfterMs, minimumInvestmentAmount, summarizeGmp } from "./gmp-summary.ts";

const emptyOffer = {
  priceBand: { lowRupees: null, highRupees: null },
  issuePriceRupees: null,
  issueSizeRupees: null,
  lotSizeShares: null,
  minimumInvestmentRupees: null,
};

test("missing GMP is unavailable rather than zero", () => {
  assert.deepEqual(
    summarizeGmp({
      gmpAmountRupees: null,
      issuePriceRupees: 100,
      priceBandLowRupees: 90,
      priceBandHighRupees: 110,
    }),
    { available: false, text: "GMP unavailable" },
  );
});

test("a GMP of zero stays zero and uses the applicable issue price", () => {
  const zero = summarizeGmp({
    gmpAmountRupees: 0,
    issuePriceRupees: 100,
    priceBandLowRupees: null,
    priceBandHighRupees: null,
  });
  assert.equal(zero.available, true);
  if (zero.available) {
    assert.match(zero.amountText, /0/);
    assert.equal(zero.percent, 0);
  }

  const fixedZero = summarizeGmp({
    gmpAmountRupees: 10,
    issuePriceRupees: 0,
    priceBandLowRupees: 100,
    priceBandHighRupees: 200,
  });
  assert.equal(fixedZero.available, true);
  if (fixedZero.available) {
    assert.equal(fixedZero.percent, null);
  }

  const band = summarizeGmp({
    gmpAmountRupees: 10,
    issuePriceRupees: null,
    priceBandLowRupees: 100,
    priceBandHighRupees: 200,
  });
  assert.equal(band.available, true);
  if (band.available) {
    assert.equal(band.percent, 5);
  }
});

test("a GMP timestamp older than the display window is stale and a missing one is not zero", () => {
  const now = new Date("2026-09-22T08:36:09.000Z");
  assert.equal(gmpDisplayFreshness("2026-09-22T07:06:09.000Z", now), "fresh");
  assert.equal(gmpDisplayFreshness(new Date(now.getTime() - gmpDisplayStaleAfterMs).toISOString(), now), "fresh");
  assert.equal(gmpDisplayFreshness(new Date(now.getTime() - gmpDisplayStaleAfterMs - 1_000).toISOString(), now), "stale");
  assert.equal(gmpDisplayFreshness(null, now), "missing");
});

test("minimum investment uses the fixed price when it is present, including zero", () => {
  const fromBand = minimumInvestmentAmount({
    ...emptyOffer,
    lotSizeShares: 50,
    priceBand: { lowRupees: 100, highRupees: 120 },
  });
  assert.deepEqual(fromBand, { status: "value", value: 6000 });

  const fixedZero = minimumInvestmentAmount({
    ...emptyOffer,
    lotSizeShares: 50,
    issuePriceRupees: 0,
    priceBand: { lowRupees: 100, highRupees: 120 },
  });
  assert.deepEqual(fixedZero, { status: "value", value: 0 });

  const missingLot = minimumInvestmentAmount(emptyOffer);
  assert.equal(missingLot.status, "missing");
});
