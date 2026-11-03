import assert from "node:assert/strict";
import test from "node:test";
import { validationFailureCount } from "../../ops/validation.ts";
import { mapGmpHistory, type GmpHistoryTarget } from "./history.ts";

const target: GmpHistoryTarget = {
  offer: { issuePriceRupees: 138, priceBandLowRupees: 120, priceBandHighRupees: 138 },
};

function historyDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary: {
      current: { price: "32", percentage: "23.19", estimated_listing_price: 170 },
      high: { price: 39.5, date: "2026-08-31" },
      low: { price: 0, date: "2026-08-29" },
      first: { price: 32, date: "2026-08-31" },
      days: 3,
      points: 3,
      issue_price: 138,
    },
    trend: [
      { date: "2026-08-29", price: "0", price_value: 0, percentage: "0", estimated_listing_price: 138 },
      { date: "2026-08-31", price: "32", price_value: 32, percentage: "23.19", estimated_listing_price: 170 },
      { date: "2026-09-02", price: "-15", price_value: -15, percentage: "-10.87", estimated_listing_price: 123 },
    ],
    timeline: [
      {
        date: "2026-08-31",
        slot: 11,
        slot_label: "11 AM",
        label: "31 Aug 2026, 11 AM",
        recorded_at: "2026-08-31 10:48:02",
        price_value: 32,
        percentage: "23.19",
        estimated_listing_price: 170,
      },
      {
        date: "2026-08-31",
        slot: 22,
        slot_label: "10 PM",
        label: "31 Aug 2026, 10 PM",
        recorded_at: "2026-08-31 22:05:00",
        price_value: 39.5,
        percentage: "28.62",
        estimated_listing_price: 177.5,
      },
      {
        date: "2026-09-02",
        slot: null,
        slot_label: null,
        label: null,
        recorded_at: "2026-09-02 17:01:00",
        price_value: -15,
        percentage: "-10.87",
        estimated_listing_price: 123,
      },
    ],
    truncated: true,
    ...overrides,
  };
}

test("keeps daily dates, zero and negative premiums, and does not fill a missing day", () => {
  const mapped = mapGmpHistory(historyDocument(), target);
  const daily = mapped?.observations.filter((point) => point.session === "daily") ?? [];
  assert.deepEqual(
    daily.map((point) => [point.observedOn, point.amountRupees, point.percent, point.observedAt]),
    [
      ["2026-08-29", 0, 0, "2026-08-28T18:30:00.000Z"],
      ["2026-08-31", 32, 23.19, "2026-08-30T18:30:00.000Z"],
      ["2026-09-02", -15, -10.87, "2026-09-01T18:30:00.000Z"],
    ],
  );
  assert.equal(daily.some((point) => point.observedOn === "2026-08-30"), false);
  assert.equal(mapped?.window.high?.amountRupees, 39.5);
  assert.equal(mapped?.window.high?.observedOn, "2026-08-31");
  assert.equal(mapped?.window.low?.amountRupees, 0);
  assert.equal(mapped?.window.truncated, true);
  assert.equal(mapped?.window.timelineLocked, false);
});

test("converts intraday recorded_at from IST and keeps the slot label", () => {
  const mapped = mapGmpHistory(historyDocument(), target);
  const intraday = mapped?.observations.filter((point) => point.session === "intraday") ?? [];
  assert.equal(intraday.length, 3);
  assert.equal(intraday[0]?.observedAt, "2026-08-31T05:18:02.000Z");
  assert.equal(intraday[0]?.slotLabel, "11 AM");
  assert.equal(intraday[0]?.observedOn, "2026-08-31");
  assert.equal(intraday[1]?.slotLabel, "10 PM");
  assert.equal(intraday[1]?.observedAt, "2026-08-31T16:35:00.000Z");
  assert.equal(intraday[2]?.slotLabel, null);
  assert.equal(intraday[2]?.amountRupees, -15);
  assert.equal(mapped?.sourceUpdatedAt, "2026-09-02T11:31:00.000Z");
  const stamps = intraday.map((point) => point.observedAt);
  assert.deepEqual(stamps, [...stamps].sort());
});

test("an empty Pro timeline is locked, not a zero series", () => {
  const before = validationFailureCount();
  const mapped = mapGmpHistory(
    historyDocument({
      timeline: [],
      locked: ["timeline"],
      truncated: false,
    }),
    target,
  );
  assert.equal(mapped?.observations.some((point) => point.session === "intraday"), false);
  assert.equal(mapped?.window.timelineLocked, true);
  assert.equal(mapped?.window.truncated, false);
  assert.equal(validationFailureCount(), before);
});

test("drops an unreadable clock and an invalid price instead of inventing a reading", () => {
  const before = validationFailureCount();
  const mapped = mapGmpHistory(
    historyDocument({
      trend: [
        { date: "2026-08-29", price: "0", price_value: 0, percentage: "0" },
        { date: "2026-08-31", price: "nope", price_value: "nope", percentage: "23.19" },
      ],
      timeline: [{ date: "2026-08-31", slot: 11, slot_label: "11 AM", recorded_at: "2026-08-31T10:48:02Z", price_value: 32 }],
    }),
    target,
  );
  assert.equal(mapped?.observations.length, 1);
  assert.equal(mapped?.observations[0]?.amountRupees, 0);
  assert.ok(validationFailureCount() > before);
});

test("rejects a payload that is not a history document", () => {
  assert.equal(mapGmpHistory(null, target), null);
  assert.equal(mapGmpHistory({ timeline: [] }, target), null);
});
