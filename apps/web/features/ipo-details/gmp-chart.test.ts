import assert from "node:assert/strict";
import test from "node:test";
import type { GmpHistoryWindow, GmpObservation } from "@ipo-singh/contracts";
import { chartSeries, chartTicks, dailyGmpPoints, dailyMaxGapMs, intradayGmpPoints, intradayMaxGapMs, layoutGmpChart } from "./gmp-chart.ts";

const window: GmpHistoryWindow = {
  high: { amountRupees: 39.5, observedOn: "2026-08-31" },
  low: { amountRupees: 0, observedOn: "2026-08-29" },
  truncated: true,
  timelineLocked: false,
};

const observations: GmpObservation[] = [
  {
    observedAt: "2026-08-28T18:30:00.000Z",
    observedOn: "2026-08-29",
    amountRupees: 0,
    percent: 0,
    session: "daily",
    slotLabel: null,
  },
  {
    observedAt: "2026-08-30T18:30:00.000Z",
    observedOn: "2026-08-31",
    amountRupees: 39.5,
    percent: 28.62,
    session: "daily",
    slotLabel: null,
  },
  {
    observedAt: "2026-09-01T18:30:00.000Z",
    observedOn: "2026-09-02",
    amountRupees: -15,
    percent: -10.87,
    session: "daily",
    slotLabel: null,
  },
  {
    observedAt: "2026-08-31T05:18:02.000Z",
    observedOn: "2026-08-31",
    amountRupees: 32,
    percent: 23.19,
    session: "intraday",
    slotLabel: "11 AM",
  },
  {
    observedAt: "2026-08-31T11:30:00.000Z",
    observedOn: "2026-08-31",
    amountRupees: 36,
    percent: 26.09,
    session: "intraday",
    slotLabel: "5 PM",
  },
  {
    observedAt: "2026-08-31T16:35:00.000Z",
    observedOn: "2026-08-31",
    amountRupees: 39.5,
    percent: 28.62,
    session: "intraday",
    slotLabel: "10 PM",
  },
  {
    observedAt: "2026-09-02T11:31:00.000Z",
    observedOn: "2026-09-02",
    amountRupees: -15,
    percent: -10.87,
    session: "intraday",
    slotLabel: null,
  },
];

test("daily points keep zero and negative readings and leave a missing day unconnected", () => {
  const points = dailyGmpPoints(observations, window);
  assert.deepEqual(
    points.map((point) => point.amountRupees),
    [0, 39.5, -15],
  );
  assert.match(points[0]?.tooltip ?? "", /29 Aug 2026/);
  assert.match(points[0]?.tooltip ?? "", /₹0/);
  assert.equal(points[0]?.axisLabel, "29 Aug 2026");
  assert.equal(points[0]?.tickLabel, "29 Aug");
  assert.equal(points[0]?.tooltip.includes("12:00"), false);
  assert.equal(points[0]?.low, true);
  assert.equal(points[1]?.high, true);
  const layout = layoutGmpChart(points, dailyMaxGapMs);
  assert.equal(layout.points.length, 3);
  assert.equal(layout.segments.length, 0);
  const series = chartSeries(points, dailyMaxGapMs);
  assert.deepEqual(
    series.map((point) => point.value),
    [0, 39.5, -15],
  );
  assert.deepEqual(
    series.map((point) => point.series),
    [0, 1, 2],
  );
  assert.equal(series.length, points.length);
});

test("intraday points use IST tooltips and do not bridge an irregular gap", () => {
  const points = intradayGmpPoints(observations, window);
  assert.equal(points.length, 4);
  assert.match(points[0]?.tooltip ?? "", /31 Aug 2026, 10:48 AM IST/);
  assert.equal(points[0]?.tickLabel, "11 AM");
  assert.match(points[0]?.axisLabel ?? "", /10:48 AM IST/);
  assert.match(points[0]?.tooltip ?? "", /11 AM/);
  assert.match(points[0]?.tooltip ?? "", /\+23\.19%/);
  assert.match(points[3]?.tooltip ?? "", /5:01 PM IST/);
  assert.match(points[3]?.tooltip ?? "", /−10\.87%/);
  const layout = layoutGmpChart(points, intradayMaxGapMs);
  assert.equal(layout.segments.length, 2);
  assert.equal(layout.points.some((point) => point.amountRupees === -15), true);
  const series = chartSeries(points, intradayMaxGapMs);
  assert.deepEqual(
    series.map((point) => point.series),
    [0, 0, 0, 1],
  );
  assert.equal(series.some((point) => point.value === 0), false);
  assert.equal(series.some((point) => point.value === -15), true);
});

test("chart ticks use observed times and stay within the requested count", () => {
  const points = dailyGmpPoints(observations, window);
  assert.deepEqual(
    chartTicks(points, 4),
    points.map((point) => point.at),
  );
  const many = Array.from({ length: 6 }, (_, index) => ({ at: index * 1_000 }));
  const ticks = chartTicks(many, 4);
  assert.equal(ticks.length, 4);
  assert.equal(ticks[0], 0);
  assert.equal(ticks.at(-1), 5_000);
  assert.equal(ticks.every((tick) => many.some((point) => point.at === tick)), true);
});

test("a current snapshot is not plotted once dated history exists", () => {
  const withSnapshot: GmpObservation[] = [
    ...observations,
    { observedAt: "2026-09-02T11:31:00.000Z", amountRupees: 99, percent: null, session: "daily" },
  ];
  assert.equal(dailyGmpPoints(withSnapshot, window).some((point) => point.amountRupees === 99), false);
});
