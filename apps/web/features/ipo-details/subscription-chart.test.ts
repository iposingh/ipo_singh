import assert from "node:assert/strict";
import test from "node:test";
import type { SubscriptionSnapshot } from "@ipo-singh/contracts";
import { subscriptionCategoryBars, subscriptionChartLayout } from "./subscription-chart.ts";

function point(input: Partial<SubscriptionSnapshot> & Pick<SubscriptionSnapshot, "totalTimes" | "observedOn">): SubscriptionSnapshot {
  return {
    retailTimes: null,
    qibTimes: null,
    niiTimes: null,
    employeeTimes: null,
    observedAt: null,
    freshness: "fresh",
    ...input,
  };
}

test("day-wise subscription chart keeps zero, drops a missing multiple, and does not bridge a missing day", () => {
  const layout = subscriptionChartLayout([
    point({ observedOn: "2026-08-24", observedAt: "2026-08-24T14:00:41.000Z", totalTimes: 0.8 }),
    point({ observedOn: "2026-08-25", observedAt: "2026-08-25T14:00:00.000Z", totalTimes: 0 }),
    point({ observedOn: "2026-08-26", observedAt: "2026-08-26T14:00:00.000Z", totalTimes: null }),
    point({ observedOn: "2026-08-28", observedAt: null, totalTimes: 12.5 }),
  ]);
  assert.deepEqual(
    layout.points.map((item) => item.amountRupees),
    [0.8, 0, 12.5],
  );
  assert.match(layout.points[0]?.tooltip ?? "", /0\.8x/);
  assert.match(layout.points[0]?.tooltip ?? "", /IST/);
  assert.match(layout.points[2]?.tooltip ?? "", /12\.5x/);
  assert.equal(layout.points[2]?.tooltip.includes("IST"), false);
  assert.equal(layout.segments.length, 1);
  const gap = (layout.points[2]?.at ?? 0) - (layout.points[1]?.at ?? 0);
  assert.ok(gap > 36 * 60 * 60 * 1000);
  assert.match(layout.points[0]?.axisLabel ?? "", /IST/);
  assert.equal(layout.points[2]?.tickLabel.includes(":"), false);
});

test("category comparison keeps a published zero and omits a missing multiple", () => {
  const snapshot: SubscriptionSnapshot = {
    totalTimes: 12.5,
    retailTimes: null,
    qibTimes: 8.25,
    niiTimes: 4,
    employeeTimes: 0,
    shareholderTimes: null,
    anchorTimes: null,
    categories: [
      { key: "RETAIL", times: null, subcategories: [] },
      { key: "QIB", times: 8.25, subcategories: [{ key: "FII", times: null }] },
      { key: "NII", times: 4, subcategories: [] },
      { key: "EMPLOYEE", times: 0, subcategories: [] },
      { key: "ANCHOR", times: null, subcategories: [] },
      { key: "HNI", times: 2, subcategories: [] },
    ],
    observedAt: "2026-09-01T13:01:00.000Z",
    observedOn: "2026-09-01",
    biddingDay: null,
    freshness: "fresh",
  };
  assert.deepEqual(
    subscriptionCategoryBars(snapshot).map((bar) => [bar.label, bar.times]),
    [
      ["Total", 12.5],
      ["QIB", 8.25],
      ["NII", 4],
      ["Employee", 0],
      ["HNI", 2],
    ],
  );
  assert.equal(subscriptionCategoryBars(null).length, 0);
});
