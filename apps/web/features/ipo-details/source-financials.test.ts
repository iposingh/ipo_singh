import assert from "node:assert/strict";
import test from "node:test";
import { chartableSourceRows, classifySourceMetric, parseSourceAmount, sourceFinancialSeries, sourceMetricReadings } from "./source-financials.ts";

const financials = {
  unit: "Rs. Crore",
  headers: ["31 Mar 2026", "31 Mar 2025", "31 Mar 2024"],
  rows: [
    { metric: "Assets", values: ["1,508.24", "", null] },
    { metric: "Note", values: ["see text", "see text", "see text"] },
  ],
  text: null,
};

test("source financial charts use published numbers and skip blank cells", () => {
  assert.equal(parseSourceAmount("1,508.24"), 1508.24);
  assert.equal(parseSourceAmount("0"), 0);
  assert.equal(parseSourceAmount(""), null);
  assert.equal(parseSourceAmount("see text"), null);
  assert.deepEqual(sourceFinancialSeries(financials, 0), [{ label: "31 Mar 2026", value: 1508.24 }]);
  assert.deepEqual(chartableSourceRows(financials), []);
  assert.deepEqual(
    chartableSourceRows({
      ...financials,
      rows: [{ metric: "Assets", values: ["1,508.24", "1,321.64", null] }],
    }),
    [0],
  );
});

test("assets, liabilities and ratios use published cells only", () => {
  assert.equal(classifySourceMetric("Assets"), "assets");
  assert.equal(classifySourceMetric("Total liabilities"), "liabilities");
  assert.equal(classifySourceMetric("Debt equity ratio"), "ratios");
  assert.equal(classifySourceMetric("Revenue"), null);
  assert.deepEqual(
    sourceMetricReadings({
      unit: "Rs. Crore",
      headers: ["31 Mar 2026", "31 Mar 2025"],
      rows: [
        { metric: "Assets", values: ["", "1,321.64"] },
        { metric: "Total liabilities", values: [null, null] },
        { metric: "Revenue", values: ["900", "800"] },
      ],
      text: null,
    }),
    [{ metric: "Assets", period: "31 Mar 2025", value: "1,321.64", group: "assets" }],
  );
});
