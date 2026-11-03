import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validationFailureCount } from "../../ops/validation.ts";
import { mapCurrentGmpCollection, type GmpMatchTarget } from "./gmp.ts";

const now = new Date("2026-09-22T07:06:09.000Z");

function target(overrides?: Partial<Omit<GmpMatchTarget, "offer">> & { offer?: Partial<GmpMatchTarget["offer"]> }): GmpMatchTarget {
  return {
    slug: overrides?.slug ?? "varmora-granito-ipo",
    status: overrides?.status ?? "open",
    offer: {
      issuePriceRupees: 148,
      priceBandLowRupees: 140,
      priceBandHighRupees: 148,
      ...overrides?.offer,
    },
  };
}

function row(gmp: Record<string, unknown> | null, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    slug: "varmora-granito-ipo",
    name: "Varmora Granito",
    type: "Mainboard",
    status: "Open",
    price_band: "140-148",
    issue_price: "148",
    gmp,
    ...extra,
  };
}

const documentedGmp = {
  price: "7.5",
  percentage: "5.07",
  kostak: null,
  subject_to_sauda: "700,,9800",
  estimated_listing_price: 155.5,
  updated_at: "2026-09-22T07:06:09.000000Z",
  updated_at_label: "22 Sep 2026, 12:36 PM IST",
};

describe("GET /gmp collection mapping", () => {
  it("uses the documented price, keeps the source timestamp, and checks the issue price", () => {
    const before = validationFailureCount();
    const [mapped] = mapCurrentGmpCollection([row(documentedGmp)], [target()], now);
    assert.equal(mapped?.slug, "varmora-granito-ipo");
    assert.equal(mapped?.snapshot.amountRupees, 7.5);
    assert.equal(mapped?.snapshot.percent, 5.07);
    assert.equal(mapped?.snapshot.indicativeImpliedPriceRupees, 155.5);
    assert.equal(mapped?.snapshot.observedAt, "2026-09-22T07:06:09.000Z");
    assert.equal(mapped?.snapshot.freshness, "fresh");
    assert.equal(validationFailureCount(), before);
  });

  it("prefers price_value and keeps a zero premium distinct from null", () => {
    const parsed = mapCurrentGmpCollection(
      [row({ ...documentedGmp, price: "7.5", price_value: 8, percentage: "5.41", estimated_listing_price: 156 })],
      [target()],
      now,
    );
    assert.equal(parsed[0]?.snapshot.amountRupees, 8);
    assert.equal(parsed[0]?.snapshot.percent, 5.41);
    assert.equal(parsed[0]?.snapshot.indicativeImpliedPriceRupees, 156);

    const zero = mapCurrentGmpCollection([row({ ...documentedGmp, price: "0", percentage: "0", estimated_listing_price: 148 })], [target()], now);
    assert.equal(zero[0]?.snapshot.amountRupees, 0);
    assert.equal(zero[0]?.snapshot.percent, 0);
    assert.equal(zero[0]?.snapshot.indicativeImpliedPriceRupees, 148);

    const missing = mapCurrentGmpCollection([row({ ...documentedGmp, price: null, percentage: null, estimated_listing_price: null })], [target()], now);
    assert.deepEqual(missing, []);
  });

  it("does not guess a percentage when the issue price is missing", () => {
    const before = validationFailureCount();
    const [mapped] = mapCurrentGmpCollection(
      [row({ ...documentedGmp, issue_price: null }, { issue_price: null })],
      [target({ offer: { issuePriceRupees: null, priceBandLowRupees: null, priceBandHighRupees: null } })],
      now,
    );
    assert.equal(mapped?.snapshot.amountRupees, 7.5);
    assert.equal(mapped?.snapshot.percent, null);
    assert.equal(mapped?.snapshot.indicativeImpliedPriceRupees, null);
    assert.equal(validationFailureCount(), before);
  });

  it("uses the stored issue price when the collection price disagrees", () => {
    const before = validationFailureCount();
    const [mapped] = mapCurrentGmpCollection([row(documentedGmp, { issue_price: "100" })], [target()], now);
    assert.equal(mapped?.snapshot.percent, 5.07);
    assert.equal(mapped?.snapshot.indicativeImpliedPriceRupees, 155.5);
    assert.ok(validationFailureCount() > before);
  });

  it("matches open and upcoming slugs once and skips closed issues", () => {
    const before = validationFailureCount();
    const upcoming = target({ slug: "sample-sme-ipo", status: "upcoming", offer: { issuePriceRupees: null, priceBandLowRupees: null, priceBandHighRupees: 50 } });
    const mapped = mapCurrentGmpCollection(
      [
        row(documentedGmp),
        row(documentedGmp),
        row({ ...documentedGmp, price: "1", percentage: "2", estimated_listing_price: 51 }, { slug: "sample-sme-ipo", issue_price: null }),
        row(documentedGmp, { slug: "closed-mills-ipo" }),
      ],
      [target(), upcoming, target({ slug: "closed-mills-ipo", status: "closed" })],
      now,
    );
    assert.deepEqual(
      mapped.map((item) => [item.slug, item.snapshot.amountRupees]),
      [
        ["varmora-granito-ipo", 7.5],
        ["sample-sme-ipo", 1],
      ],
    );
    assert.equal(mapped[1]?.snapshot.percent, 2);
    assert.ok(validationFailureCount() > before);
  });
});
