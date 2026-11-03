import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatIstDateTime } from "@ipo-singh/core";
import { mapCurrentSubscription, mapSubscriptionHistory } from "./subscription.ts";

const live = {
  summary: {
    total: "12.5",
    qib: "8.25",
    nii: "4",
    retail: "0.8",
    employee: "0",
    shareholder: "0",
    anchor: null,
    applications: "1400",
    updated_at: "2026-09-01T13:01:00.000000Z",
    updated_at_label: "01 Sep 2026, 06:31 PM IST",
  },
  categories: [
    {
      key: "QIB",
      times: "8.25",
      times_value: 8.25,
      sub_categories: [{ key: "FII", times: "", times_value: null }],
    },
    {
      key: "NII",
      times: "4",
      times_value: 4,
      sub_categories: [
        { key: "BNII", times: "3", times_value: 3 },
        { key: "SNII", times: "1", times_value: 1 },
        { key: "MADE_UP", times: "9", times_value: 9 },
      ],
    },
    { key: "RETAIL", times: "0.8", times_value: 0.8, sub_categories: [] },
    { key: "EMPLOYEE", times: "0", times_value: 0, sub_categories: [] },
    { key: "SHAREHOLDER", times: "0", times_value: 0, sub_categories: [] },
    { key: "TOTAL", times: "12.5", times_value: 12.5, sub_categories: [] },
    { key: "UNKNOWN_BOOK", times: "2", times_value: 2, sub_categories: [] },
  ],
  demand_price: 100,
  qib_interest_cost: { cost_percent: 1.2 },
};

describe("IPO Guru subscription normalization", () => {
  it("keeps published zeroes, blank multiples, and stable subcategory keys", () => {
    const mapped = mapCurrentSubscription(live);
    const row = mapped?.observations[0];
    assert.ok(row);
    assert.equal(row.totalTimes, 12.5);
    assert.equal(row.retailTimes, 0.8);
    assert.equal(row.qibTimes, 8.25);
    assert.equal(row.niiTimes, 4);
    assert.equal(row.employeeTimes, 0);
    assert.equal(row.shareholderTimes, 0);
    assert.equal(row.anchorTimes, null);
    assert.equal(row.observedAt, "2026-09-01T13:01:00.000Z");
    assert.match(formatIstDateTime(new Date(row.observedAt ?? "")), /6:31 PM IST/);
    const nii = row.categories?.find((category) => category.key === "NII");
    assert.deepEqual(
      nii?.subcategories.map((item) => item.key),
      ["BNII", "SNII"],
    );
    assert.equal(nii?.times, 4);
    assert.equal(row.categories?.find((category) => category.key === "QIB")?.subcategories[0]?.times, null);
    assert.equal(row.categories?.some((category) => category.key === "UNKNOWN_BOOK"), false);
    assert.equal(JSON.stringify(row).includes("1400"), false);
    assert.equal(JSON.stringify(row).includes("qib_interest_cost"), false);
  });

  it("prefers times_value and does not turn a blank string into 0x", () => {
    const mapped = mapCurrentSubscription({
      summary: {
        total: "",
        qib: null,
        nii: "0",
        retail: null,
        employee: null,
        shareholder: null,
        anchor: null,
        updated_at: "2026-09-01T13:01:00.000000Z",
      },
      categories: [
        { key: "TOTAL", times: "", times_value: null, sub_categories: [] },
        { key: "NII", times: "9", times_value: 0, sub_categories: [] },
      ],
    });
    const row = mapped?.observations[0];
    assert.equal(row?.totalTimes, null);
    assert.equal(row?.niiTimes, 0);
    assert.equal(row?.qibTimes, null);
  });

  it("stores a history clock in Asia/Kolkata and leaves a missing clock empty", () => {
    const mapped = mapSubscriptionHistory({
      count: 2,
      day_wise: [
        { day: 1, date: "2026-08-24", time: "19:30:41", qib: "1.5", nii: null, retail: "0", employee: "0", shareholder: null, total: "0.8" },
        { day: null, date: "2026-08-26", time: null, qib: null, nii: null, retail: null, employee: null, shareholder: "0", total: "12.5" },
      ],
    });
    assert.equal(mapped?.observations.length, 2);
    const first = mapped?.observations[0];
    const second = mapped?.observations[1];
    assert.equal(first?.observedAt, "2026-08-24T14:00:41.000Z");
    assert.equal(first?.observedOn, "2026-08-24");
    assert.equal(first?.retailTimes, 0);
    assert.equal(first?.niiTimes, null);
    assert.equal(first?.anchorTimes, null);
    assert.equal(first?.categories?.some((category) => category.key === "ANCHOR"), false);
    assert.equal(second?.observedAt, null);
    assert.equal(second?.observedOn, "2026-08-26");
    assert.equal(second?.biddingDay, null);
    assert.equal(second?.totalTimes, 12.5);
    assert.equal(second?.shareholderTimes, 0);
  });

  it("rejects a non-document and does not invent a missing day", () => {
    assert.equal(mapCurrentSubscription(null), null);
    assert.equal(mapSubscriptionHistory({ day_wise: "nope" }), null);
    const mapped = mapSubscriptionHistory({
      day_wise: [{ day: 1, date: "2026-08-24", time: "19:30:41", total: "1" }],
    });
    assert.equal(mapped?.observations.length, 1);
  });
});
