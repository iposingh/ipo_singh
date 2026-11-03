import assert from "node:assert/strict";
import test from "node:test";
import { listingReturn } from "./listing-return.ts";

const prices = {
  issuePriceRupees: null,
  priceBandLowRupees: 100,
  priceBandHighRupees: 100,
  listingIssuePriceRupees: null,
  listingPriceRupees: 120,
};

test("listing return uses the listing price and the issue price", () => {
  assert.deepEqual(listingReturn({ ...prices, listingIssuePriceRupees: 100 }), {
    issuePriceRupees: 100,
    listingPriceRupees: 120,
    gainRupees: 20,
    gainPercent: 20,
  });
  assert.deepEqual(listingReturn({ ...prices, listingIssuePriceRupees: 100, listingPriceRupees: 75 }).gainPercent, -25);
  assert.equal(listingReturn({ ...prices, listingIssuePriceRupees: 100, listingPriceRupees: 100 }).gainPercent, 0);
});

test("a missing listing price does not borrow GMP or an expected price", () => {
  const result = listingReturn({ ...prices, listingPriceRupees: null, listingIssuePriceRupees: 100 });
  assert.equal(result.listingPriceRupees, null);
  assert.equal(result.gainPercent, null);
  assert.equal(result.gainRupees, null);
});

test("a zero issue price does not produce a percentage", () => {
  const result = listingReturn({ ...prices, listingIssuePriceRupees: 0, listingPriceRupees: 10 });
  assert.equal(result.gainPercent, null);
  assert.equal(result.gainRupees, null);
});
