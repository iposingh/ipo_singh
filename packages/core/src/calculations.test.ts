import assert from "node:assert/strict";
import test from "node:test";
import { resolveFreshness } from "./freshness.ts";
import { gmpPercent, indicativeGmpDisclaimer, indicativeGmpImpliedPrice, isIndicativeGmpPrice, unofficialGmpDisclaimer } from "./gmp.ts";
import { investmentForLots, minimumLotInvestmentRupees } from "./investment.ts";
import { ipoLifecycleStatus, resolveIpoLifecycle } from "./lifecycle.ts";
import { actualListingGainPercent } from "./listing.ts";
import { formatInr, formatInrScale, formatSubscriptionMultiple } from "./money.ts";
import { applicableIssuePriceRupees } from "./price.ts";
import { istCalendarDate } from "./time.ts";

test("GMP percent uses the issue price and keeps zero and negative premiums", () => {
  assert.deepEqual(gmpPercent({ gmpAmountRupees: 25, issuePriceRupees: 100 }), { status: "value", value: 25 });
  assert.deepEqual(gmpPercent({ gmpAmountRupees: 0, issuePriceRupees: 100 }), { status: "value", value: 0 });
  assert.deepEqual(gmpPercent({ gmpAmountRupees: -10, issuePriceRupees: 100 }), { status: "value", value: -10 });
  assert.deepEqual(gmpPercent({ gmpAmountRupees: 100, issuePriceRupees: 300 }), { status: "value", value: 33.33 });
  assert.deepEqual(gmpPercent({ gmpAmountRupees: null, issuePriceRupees: 100 }), { status: "missing" });
  assert.deepEqual(gmpPercent({ gmpAmountRupees: 10, issuePriceRupees: null }), { status: "missing" });
  assert.deepEqual(gmpPercent({ gmpAmountRupees: 10, issuePriceRupees: 0 }), { status: "invalid", reason: "zero-base-price" });
  assert.deepEqual(gmpPercent({ gmpAmountRupees: 10, issuePriceRupees: -5 }), { status: "invalid", reason: "negative-price" });
});

test("a stale GMP observation does not change the calculated percent", () => {
  const now = new Date("2026-10-18T06:00:00.000Z");
  const percent = gmpPercent({ gmpAmountRupees: 0, issuePriceRupees: 200 });
  const freshness = resolveFreshness(new Date("2026-10-17T06:00:00.000Z"), now);
  assert.deepEqual(percent, { status: "value", value: 0 });
  assert.equal(freshness, "stale");
});

test("GMP Delayed uses a strict greater-than 24-hour observation age", () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date("2026-10-29T06:00:00.000Z");
  assert.equal(resolveFreshness(new Date(now.getTime() - dayMs), now, dayMs), "fresh");
  assert.equal(resolveFreshness(new Date(now.getTime() - dayMs - 1), now, dayMs), "stale");
});

test("GMP-implied price is indicative and is not a listing promise", () => {
  const implied = indicativeGmpImpliedPrice({ gmpAmountRupees: 25, issuePriceRupees: 100 });
  assert.equal(isIndicativeGmpPrice(implied), true);
  if (isIndicativeGmpPrice(implied)) {
    assert.equal(implied.rupees, 125);
    assert.equal(implied.kind, "indicative-gmp-implied-price");
    assert.equal(implied.disclaimer, indicativeGmpDisclaimer);
    assert.match(implied.disclaimer, /not a guaranteed listing price/);
    assert.match(unofficialGmpDisclaimer, /unofficial/);
    assert.doesNotMatch(unofficialGmpDisclaimer, /15 minutes/);
  }
  assert.deepEqual(indicativeGmpImpliedPrice({ gmpAmountRupees: -100, issuePriceRupees: 100 }), {
    status: "value",
    kind: "indicative-gmp-implied-price",
    rupees: 0,
    disclaimer: indicativeGmpDisclaimer,
  });
  assert.deepEqual(indicativeGmpImpliedPrice({ gmpAmountRupees: -150, issuePriceRupees: 100 }), {
    status: "invalid",
    reason: "negative-implied-price",
  });
  assert.deepEqual(indicativeGmpImpliedPrice({ gmpAmountRupees: null, issuePriceRupees: 100 }), { status: "missing" });
});

test("the applicable issue price prefers a fixed price, including zero, then the band high", () => {
  assert.deepEqual(applicableIssuePriceRupees({ issuePriceRupees: 0, priceBandHighRupees: 100 }), { status: "value", value: 0 });
  assert.deepEqual(applicableIssuePriceRupees({ issuePriceRupees: null, priceBandLowRupees: 90, priceBandHighRupees: 100 }), {
    status: "value",
    value: 100,
  });
  assert.deepEqual(applicableIssuePriceRupees({ issuePriceRupees: null, priceBandHighRupees: null }), { status: "missing" });
  assert.deepEqual(applicableIssuePriceRupees({ priceBandLowRupees: 120, priceBandHighRupees: 100 }), {
    status: "invalid",
    reason: "inverted-price-band",
  });
});

test("lot investment keeps zero lots and rejects partial lots", () => {
  assert.deepEqual(minimumLotInvestmentRupees(50, 100), { status: "value", value: 5000 });
  assert.deepEqual(minimumLotInvestmentRupees(0, 100), { status: "value", value: 0 });
  assert.deepEqual(minimumLotInvestmentRupees(null, 100), { status: "missing" });
  assert.deepEqual(minimumLotInvestmentRupees(50, null), { status: "missing" });
  assert.deepEqual(minimumLotInvestmentRupees(1.5, 100), { status: "invalid", reason: "fractional-quantity" });
  assert.deepEqual(minimumLotInvestmentRupees(-1, 100), { status: "invalid", reason: "negative-quantity" });
  assert.deepEqual(investmentForLots(5000, 2), { status: "value", value: 10000 });
  assert.deepEqual(investmentForLots(5000, 0), { status: "value", value: 0 });
  assert.deepEqual(investmentForLots(null, 0), { status: "missing" });
  assert.deepEqual(investmentForLots(5000, -2), { status: "invalid", reason: "negative-quantity" });
});

test("listing gain is the actual price change, including a loss and a flat open", () => {
  assert.deepEqual(actualListingGainPercent({ listingPriceRupees: 120, issuePriceRupees: 100 }), { status: "value", value: 20 });
  assert.deepEqual(actualListingGainPercent({ listingPriceRupees: 80, issuePriceRupees: 100 }), { status: "value", value: -20 });
  assert.deepEqual(actualListingGainPercent({ listingPriceRupees: 100, issuePriceRupees: 100 }), { status: "value", value: 0 });
  assert.deepEqual(actualListingGainPercent({ listingPriceRupees: null, issuePriceRupees: 100 }), { status: "missing" });
  assert.deepEqual(actualListingGainPercent({ listingPriceRupees: 100, issuePriceRupees: 0 }), {
    status: "invalid",
    reason: "zero-base-price",
  });
});

test("Indian scale formatting names lakh and crore and keeps the sign", () => {
  assert.equal(formatInr(99999), "₹99,999");
  assert.equal(formatInr(-125), "-₹125");
  assert.equal(formatInrScale(0), "₹0");
  assert.equal(formatInrScale(null), "Unavailable");
  assert.equal(formatInrScale(100000), "₹1 lakh");
  assert.equal(formatInrScale(150000), "₹1.5 lakh");
  assert.equal(formatInrScale(10000000), "₹1 crore");
  assert.equal(formatInrScale(12500000), "₹1.25 crore");
  assert.equal(formatInrScale(-250000), "-₹2.5 lakh");
  assert.equal(formatSubscriptionMultiple(-1), "-1x");
  assert.equal(formatSubscriptionMultiple(0), "0x");
});

test("IST calendar dates do not shift across midnight", () => {
  assert.equal(istCalendarDate(new Date("2026-10-18T18:29:00.000Z")), "2026-10-18");
  assert.equal(istCalendarDate(new Date("2026-10-18T18:30:00.000Z")), "2026-10-19");
  assert.equal(istCalendarDate(null), null);
});

test("lifecycle status follows India dates and does not invent a missing phase", () => {
  const dates = {
    openDate: "2026-10-20",
    closeDate: "2026-10-22",
    allotmentDate: "2026-10-24",
    listingDate: "2026-10-27",
  };
  assert.deepEqual(ipoLifecycleStatus({ ...dates, today: "2026-10-19" }), { status: "upcoming" });
  assert.deepEqual(ipoLifecycleStatus({ ...dates, today: "2026-10-20" }), { status: "open" });
  assert.deepEqual(ipoLifecycleStatus({ ...dates, today: "2026-10-22" }), { status: "open" });
  assert.deepEqual(ipoLifecycleStatus({ ...dates, today: "2026-10-23" }), { status: "closed" });
  assert.deepEqual(ipoLifecycleStatus({ ...dates, today: "2026-10-24" }), { status: "allotment" });
  assert.deepEqual(ipoLifecycleStatus({ ...dates, today: "2026-10-27" }), { status: "listed" });
  assert.deepEqual(ipoLifecycleStatus({ ...dates, today: "2026-10-28" }), { status: "listed" });
  assert.deepEqual(
    ipoLifecycleStatus({ openDate: null, closeDate: null, allotmentDate: null, listingDate: null, today: "2026-10-20" }),
    { status: "unknown", reason: "missing-dates" },
  );
  assert.deepEqual(
    ipoLifecycleStatus({ ...dates, closeDate: null, today: "2026-10-21" }),
    { status: "unknown", reason: "missing-dates" },
  );
  assert.deepEqual(
    ipoLifecycleStatus({ ...dates, listingDate: "2026-10-18", today: "2026-10-21" }),
    { status: "unknown", reason: "inconsistent-dates" },
  );
});

test("a stale provider Open after the close date becomes allotment awaited", () => {
  const eaaa = resolveIpoLifecycle({
    today: "2026-10-29",
    openDate: "2026-10-26",
    closeDate: "2026-10-28",
    allotmentDate: "2026-10-29",
    listingDate: "2026-11-02",
    providerStatus: "open",
  });
  assert.equal(eaaa.status === "unknown" ? null : eaaa.status, "allotment");
  assert.equal(eaaa.status === "unknown" ? null : eaaa.stage, "allotment-awaited");
  assert.equal(eaaa.status === "unknown" ? null : eaaa.closeBasis, "calendar-day");
});
