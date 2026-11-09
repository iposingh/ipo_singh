import assert from "node:assert/strict";
import test from "node:test";
import type { GmpHistoryWindow, GmpObservation, SubscriptionSnapshot } from "@ipo-singh/contracts";
import { layout } from "@ipo-singh/design-tokens";
import { pagePadding } from "../design/layout.ts";
import {
  availableHistoryRanges,
  canDrawLineChart,
  categoryComparisonSummary,
  categoryLabel,
  chartFrameWidth,
  chartTicks,
  chronologicalGmp,
  clipGmpObservations,
  clipSubscriptionObservations,
  dailyGmpPoints,
  dailyMaxGapMs,
  gmpHistorySummary,
  gmpPercentPlot,
  gmpRupeePlot,
  gmpTableRows,
  historyProvenanceText,
  intradayGmpPoints,
  intradayMaxGapMs,
  chartRenderPointLimit,
  lineChartDataPoints,
  plotBands,
  safeChartFrameWidth,
  sanitizeCategoryBarsForNative,
  sanitizePlotPointsForNative,
  subscriptionCategoryBars,
  subscriptionHistorySummary,
  subscriptionPlot,
  subscriptionSeriesChoices,
  subscriptionTable,
} from "./series.ts";

const historyWindow: GmpHistoryWindow = {
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
    percent: null,
    session: "intraday",
    slotLabel: null,
  },
];

function subscriptionPoint(input: Partial<SubscriptionSnapshot> & Pick<SubscriptionSnapshot, "totalTimes" | "observedOn">): SubscriptionSnapshot {
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

test("daily GMP keeps zero and negative readings and leaves a missing day unconnected", () => {
  const points = dailyGmpPoints(observations, historyWindow);
  assert.deepEqual(
    points.map((point) => point.amountRupees),
    [0, 39.5, -15],
  );
  assert.equal(points[0]?.axisLabel, "29 Aug 2026");
  assert.equal(points[0]?.tooltip.includes("12:00"), false);
  assert.equal(points[0]?.low, true);
  assert.equal(points[1]?.high, true);
  const plot = gmpRupeePlot(points, dailyMaxGapMs);
  assert.deepEqual(
    plot.map((point) => point.series),
    [0, 1, 2],
  );
  assert.equal(plotBands(plot).length, 3);
  assert.equal(gmpTableRows(points).length, points.length);
  assert.match(gmpHistorySummary("Daily GMP", points.length, historyWindow), /not a guaranteed return/);
  assert.match(gmpHistorySummary("Daily GMP", points.length, historyWindow), /partial/);
});

test("intraday GMP uses IST tooltips and does not plot a missing percent as zero", () => {
  const points = intradayGmpPoints(observations, historyWindow);
  assert.equal(points.length, 4);
  assert.match(points[0]?.tooltip ?? "", /31 Aug 2026, 10:48 AM IST/);
  assert.equal(points[0]?.tickLabel, "11 AM");
  assert.match(points[0]?.tooltip ?? "", /\+23\.19%/);
  const rupees = gmpRupeePlot(points, intradayMaxGapMs);
  assert.deepEqual(
    rupees.map((point) => point.series),
    [0, 0, 0, 1],
  );
  const percent = gmpPercentPlot(points, intradayMaxGapMs);
  assert.equal(percent.some((point) => point.value === 0), false);
  assert.equal(percent.length, 3);
  assert.equal(percent.some((point) => point.value === -15), false);
  const rows = gmpTableRows(points);
  assert.equal(rows[3]?.percent, "Unavailable");
  assert.equal(rows[3]?.amount.includes("-") || rows[3]?.amount.includes("−") || rows[3]?.amount.includes("15"), true);
});

test("a large daily history keeps every stored reading and limits axis ticks", () => {
  const many: GmpObservation[] = Array.from({ length: 400 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, 1 + index));
    const observedOn = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    return {
      observedAt: `${observedOn}T18:30:00.000Z`,
      observedOn,
      amountRupees: index === 10 ? null : index,
      percent: index % 17 === 0 ? null : index / 10,
      session: "daily" as const,
      slotLabel: null,
    };
  });
  const points = dailyGmpPoints(many, null);
  assert.equal(points.length, 399);
  assert.equal(points.some((point) => point.amountRupees === 0), true);
  assert.equal(points.some((point) => point.amountRupees === 10), false);
  const ticks = chartTicks(points, 4);
  assert.equal(ticks.length, 4);
  assert.equal(ticks[0], points[0]?.at);
  assert.equal(ticks.at(-1), points.at(-1)?.at);
  assert.equal(gmpTableRows(points).length, 399);
  const percent = gmpPercentPlot(points, dailyMaxGapMs);
  assert.equal(percent.some((point) => point.value === 0 && points.find((item) => item.at === point.at)?.percent === null), false);
});

test("sparse subscription days stay disconnected and a published zero stays zero", () => {
  const rows = [
    subscriptionPoint({ observedOn: "2026-08-24", observedAt: "2026-08-24T14:00:41.000Z", totalTimes: 0.8, retailTimes: 0, qibTimes: null, niiTimes: 1 }),
    subscriptionPoint({ observedOn: "2026-08-25", observedAt: "2026-08-25T14:00:00.000Z", totalTimes: 0, retailTimes: null, qibTimes: 2, niiTimes: null }),
    subscriptionPoint({ observedOn: "2026-08-26", observedAt: "2026-08-26T14:00:00.000Z", totalTimes: null, retailTimes: 4, qibTimes: 4, niiTimes: 4 }),
    subscriptionPoint({ observedOn: "2026-08-28", observedAt: null, totalTimes: 12.5, retailTimes: null, qibTimes: null, niiTimes: null }),
  ];
  const total = subscriptionPlot(rows, "TOTAL");
  assert.deepEqual(
    total.map((point) => point.value),
    [0.8, 0, 12.5],
  );
  assert.equal(plotBands(total).length, 2);
  assert.match(total[0]?.tooltip ?? "", /IST/);
  assert.equal(total[2]?.tooltip.includes("IST"), false);
  const retail = subscriptionPlot(rows, "RETAIL");
  assert.deepEqual(
    retail.map((point) => point.value),
    [0, 4],
  );
  assert.equal(plotBands(retail).length, 2);
  const choices = subscriptionSeriesChoices(rows, null);
  assert.deepEqual(
    choices.map((choice) => choice.key),
    ["TOTAL", "RETAIL", "QIB", "NII"],
  );
  const table = subscriptionTable(rows);
  assert.equal(table.rows.length, 4);
  assert.equal(table.rows[2]?.cells[1], "Unavailable");
  assert.match(subscriptionHistorySummary("Total", total.length), /0x/);
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
  const bars = subscriptionCategoryBars(snapshot);
  assert.deepEqual(
    bars.map((bar) => [bar.label, bar.times]),
    [
      ["Total", 12.5],
      ["QIB", 8.25],
      ["NII / HNI", 4],
      ["Employee", 0],
      ["HNI", 2],
    ],
  );
  assert.equal(categoryLabel("NII"), "NII / HNI");
  assert.equal(categoryLabel("RETAIL"), "Retail");
  assert.equal(categoryLabel("QIB"), "QIB");
  assert.equal(subscriptionCategoryBars(null).length, 0);
  assert.match(categoryComparisonSummary(bars), /Employee 0x/);
  assert.equal(categoryComparisonSummary(bars).includes("Retail"), false);
  const choices = subscriptionSeriesChoices([], snapshot);
  assert.equal(choices.some((choice) => choice.key === "HNI"), true);
  assert.equal(choices.some((choice) => choice.key === "RETAIL"), true);
});

test("a small screen keeps the chart inside the page padding", () => {
  const narrow = chartFrameWidth(320);
  assert.equal(narrow, 320 - pagePadding(320) * 2);
  assert.ok(narrow < 320);
  assert.ok(narrow >= 160);
  const wide = chartFrameWidth(1400);
  assert.equal(wide, layout.contentMaxWidth - pagePadding(1400) * 2);
  assert.ok(wide < layout.contentMaxWidth);
});

test("history ranges clip stored observations without inventing points", () => {
  const sorted = chronologicalGmp([observations[2]!, observations[0]!, observations[1]!]);
  assert.deepEqual(
    sorted.map((row) => row.observedOn),
    ["2026-08-29", "2026-08-31", "2026-09-02"],
  );
  assert.equal(canDrawLineChart(0), false);
  assert.equal(canDrawLineChart(1), false);
  assert.equal(canDrawLineChart(2), true);
  const plotted = lineChartDataPoints(
    [
      { at: 1_700_000_000_000, value: 10, tooltip: "a", tickLabel: "A", high: false, low: false, series: 0 },
      { at: 1_700_086_400_000, value: 12, tooltip: "b", tickLabel: "B", high: false, low: false, series: 0 },
    ],
    new Set([1_700_000_000_000]),
  );
  assert.equal(plotted.every((point) => !("x" in point)), true);
  assert.equal(safeChartFrameWidth(Number.POSITIVE_INFINITY), 160);

  const emptyDaily = dailyGmpPoints([], null);
  assert.deepEqual(emptyDaily, []);
  assert.deepEqual(gmpRupeePlot(emptyDaily, dailyMaxGapMs), []);
  assert.deepEqual(gmpTableRows(emptyDaily), []);
  assert.deepEqual(availableHistoryRanges([]), ["all"]);

  const times = observations.map((row) => Date.parse(row.observedAt));
  assert.deepEqual(availableHistoryRanges(times), ["all", "7d"]);
  const week = clipGmpObservations(observations, "7d");
  assert.ok(week.length >= 1);
  assert.ok(week.every((row) => Date.parse(row.observedAt) >= Math.max(...times) - 7 * 24 * 60 * 60 * 1000));
  assert.equal(clipGmpObservations([], "30d").length, 0);

  const sparse = [
    subscriptionPoint({ observedOn: "2026-08-01", observedAt: "2026-08-01T10:00:00.000Z", totalTimes: 1 }),
    subscriptionPoint({ observedOn: "2026-08-20", observedAt: "2026-08-20T10:00:00.000Z", totalTimes: 2 }),
    subscriptionPoint({ observedOn: "2026-08-28", observedAt: "2026-08-28T10:00:00.000Z", totalTimes: null }),
  ];
  const clipped = clipSubscriptionObservations(sparse, "7d");
  assert.deepEqual(
    clipped.map((row) => row.observedOn),
    ["2026-08-28"],
  );
  assert.equal(subscriptionPlot(clipped, "TOTAL").length, 0);
  assert.equal(subscriptionTable(clipped).rows[0]?.cells[1], "Unavailable");

  const longSpan = [
    subscriptionPoint({ observedOn: "2026-07-01", observedAt: "2026-07-01T10:00:00.000Z", totalTimes: 1 }),
    subscriptionPoint({ observedOn: "2026-08-28", observedAt: "2026-08-28T10:00:00.000Z", totalTimes: 3 }),
  ];
  assert.deepEqual(
    availableHistoryRanges(longSpan.map((row) => Date.parse(row.observedAt!))),
    ["all", "30d", "7d"],
  );
  assert.deepEqual(
    clipSubscriptionObservations(longSpan, "30d").map((row) => row.observedOn),
    ["2026-08-28"],
  );

  assert.match(historyProvenanceText({ sourceName: "IPO Singh", retrievedAt: "2026-08-31T05:18:02.000Z" }), /31 Aug 2026, 10:48 AM IST/);
  assert.match(historyProvenanceText({ sourceName: "IPO Singh", retrievedAt: "2026-08-31T05:18:02.000Z" }), /not exchange data/);
  assert.match(historyProvenanceText({ sourceName: "IPO Singh", retrievedAt: null }), /Retrieved Unavailable/);
  assert.match(gmpTableRows(dailyGmpPoints(observations, historyWindow))[0]?.when ?? "", /29 Aug 2026/);
  assert.equal(gmpTableRows(dailyGmpPoints(observations, historyWindow))[0]?.percent, "0.00%");
  assert.equal(gmpTableRows(dailyGmpPoints(observations, historyWindow))[2]?.percent.includes("-") || gmpTableRows(dailyGmpPoints(observations, historyWindow))[2]?.percent.includes("−"), true);
});

test("native chart guards refuse non-finite values and cap dense series", () => {
  const plot = gmpRupeePlot(dailyGmpPoints(observations, historyWindow), dailyMaxGapMs);
  const poisoned = [
    ...plot,
    { at: plot[0]?.at ?? 0, value: Number.NaN, tooltip: "nan", tickLabel: "", high: false, low: false, series: 0 },
    { at: Number.POSITIVE_INFINITY, value: 9, tooltip: "inf-at", tickLabel: "", high: false, low: false, series: 0 },
  ];
  const safe = sanitizePlotPointsForNative(poisoned);
  assert.equal(safe.every((point) => Number.isFinite(point.value) && Number.isFinite(point.at)), true);
  assert.equal(lineChartDataPoints(safe, new Set(safe.map((point) => point.at))).every((point) => !("x" in point)), true);
  const dense = Array.from({ length: 200 }, (_, index) => ({
    at: index,
    value: index % 7,
    tooltip: String(index),
    tickLabel: "",
    high: false,
    low: false,
    series: 0,
  }));
  assert.equal(sanitizePlotPointsForNative(dense).length, chartRenderPointLimit);
  assert.equal(chartRenderPointLimit <= 64, true);
  const bars = sanitizeCategoryBarsForNative([
    { key: "TOTAL", label: "Total", times: 2 },
    { key: "BAD", label: "Bad", times: Number.NEGATIVE_INFINITY },
  ]);
  assert.deepEqual(
    bars.bars.map((bar) => bar.key),
    ["TOTAL"],
  );
  assert.equal(bars.maxValue, 2.3);
});
