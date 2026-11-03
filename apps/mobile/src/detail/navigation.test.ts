import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultAccountPreferences } from "@ipo-singh/contracts";
import { issueHref, issueRoute } from "../catalogue/routes.ts";
import {
  chartRenderPointLimit,
  lineChartDataPoints,
  plotBands,
  safeChartFrameWidth,
  safeChartSpacing,
  sanitizeCategoryBarsForNative,
  sanitizePlotPointsForNative,
  type PlotPoint,
} from "../charts/series.ts";
import { routeFromPushData } from "../notifications/push.ts";
import { safeRouteSlug } from "../security/routes.ts";
import { diagnosticsAvailable, diagnosticsSectionTitle, nextDiagnosticsVisible } from "../settings/diagnostics.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("IPO card navigation accepts catalogue slugs and rejects unsafe params", () => {
  assert.deepEqual(issueRoute("hgs-india-sme-ipo"), {
    pathname: "/ipo/[slug]",
    params: { slug: "hgs-india-sme-ipo" },
  });
  assert.equal(issueHref("hgs-india-sme-ipo"), "/ipo/hgs-india-sme-ipo");
  assert.equal(issueRoute("../etc/passwd"), null);
  assert.equal(issueHref("HGS"), null);
  assert.equal(issueHref(""), null);
});

test("line chart payloads never carry Unix timestamp x coordinates", () => {
  const points: PlotPoint[] = [
    { at: 1_793_039_400_000, value: 0, tooltip: "a", tickLabel: "27 Oct", high: true, low: true, series: 0 },
    { at: 1_793_125_800_000, value: 5, tooltip: "b", tickLabel: "28 Oct", high: false, low: false, series: 0 },
  ];
  const data = lineChartDataPoints(points, new Set(points.map((point) => point.at)));
  assert.equal(data.length, 2);
  for (const point of data) {
    assert.equal("x" in point, false);
    assert.equal(Number.isFinite(point.value), true);
  }
  assert.deepEqual(
    plotBands(points).map((band) => band.length),
    [2],
  );
  assert.equal(safeChartFrameWidth(Number.NaN), 160);
  assert.equal(safeChartFrameWidth(40), 160);
  assert.equal(safeChartFrameWidth(358.7), 358);
  assert.equal(safeChartSpacing(Number.NaN, Number.POSITIVE_INFINITY), 8);
  assert.equal(Number.isFinite(safeChartSpacing(360, 12)), true);
  assert.equal(safeChartSpacing(360, 12) >= 8, true);
});

test("chart sanitization drops NaN/Infinity and thins oversized series", () => {
  const dirty: PlotPoint[] = [
    { at: 1, value: Number.NaN, tooltip: "bad", tickLabel: "", high: false, low: false, series: 0 },
    { at: 2, value: Number.POSITIVE_INFINITY, tooltip: "inf", tickLabel: "", high: false, low: false, series: 0 },
    { at: Number.NaN, value: 3, tooltip: "bad-at", tickLabel: "", high: false, low: false, series: 0 },
    { at: 4, value: 1, tooltip: "ok", tickLabel: "A", high: false, low: false, series: 0 },
  ];
  assert.deepEqual(
    sanitizePlotPointsForNative(dirty).map((point) => point.value),
    [1],
  );
  const dense = Array.from({ length: chartRenderPointLimit + 40 }, (_, index) => ({
    at: index,
    value: index,
    tooltip: String(index),
    tickLabel: "",
    high: false,
    low: false,
    series: 0,
  }));
  assert.equal(sanitizePlotPointsForNative(dense).length, chartRenderPointLimit);
  assert.equal(sanitizeCategoryBarsForNative([{ key: "TOTAL", label: "Total", times: Number.NaN }]).bars.length, 0);
  assert.equal(sanitizeCategoryBarsForNative([{ key: "TOTAL", label: "Total", times: 10 }]).maxValue, 11.5);
});

test("invalid deep links and push payloads do not invent IPO routes", () => {
  assert.equal(safeRouteSlug(""), null);
  assert.equal(safeRouteSlug("../secret"), null);
  assert.equal(safeRouteSlug(["fixture-mills"]), "fixture-mills");
  assert.equal(routeFromPushData({ slug: "fixture-mills" })?.params.slug, "fixture-mills");
  assert.equal(routeFromPushData({ title: "Allotment Out" }), null);
  assert.equal(defaultAccountPreferences.mainboardGlobalAlerts, false);
  assert.equal(defaultAccountPreferences.smeWatchlistAlerts, false);
});

test("homepage IPO cards omit GMP while detail models still surface stored premiums", () => {
  const card = readFileSync(join(root, "src/components/ipo-card.tsx"), "utf8");
  assert.match(card, /GMP and subscription stay on the IPO detail screen/);
  assert.equal(card.includes("gmpAmountRupees"), false);
  assert.equal(card.includes("Current GMP"), false);
  const detail = readFileSync(join(root, "src/components/ipo-detail-view.tsx"), "utf8");
  assert.match(detail, /Current GMP/);
  assert.match(detail, /GmpHistoryPanels/);
});

test("developer diagnostics stay hidden until revealed and are off in production", () => {
  assert.equal(nextDiagnosticsVisible(false), true);
  assert.equal(nextDiagnosticsVisible(true), false);
  assert.equal(nextDiagnosticsVisible(true, false), false);
  assert.equal(diagnosticsAvailable("development"), true);
  assert.equal(diagnosticsAvailable("preview"), true);
  assert.equal(diagnosticsAvailable("production"), false);
  assert.equal(diagnosticsSectionTitle(), "Developer diagnostics");
  const settings = readFileSync(join(root, "src/screens/settings-screen.tsx"), "utf8");
  assert.equal(settings.includes('title="Connection"'), false);
  assert.match(settings, /diagnosticsOpen/);
  assert.match(settings, /canOpenDiagnostics/);
  assert.match(settings, /ApiStatus/);
  assert.match(settings, /not investment advice/);
});

test("Android list clipping is disabled to avoid release navigation crashes", () => {
  const listing = readFileSync(join(root, "src/components/listing-list.tsx"), "utf8");
  assert.match(listing, /removeClippedSubviews=\{false\}/);
  assert.match(listing, /warmCatalogueIssue/);
  assert.match(listing, /try \{[\s\S]*router\.push/);
  const charts = readFileSync(join(root, "src/components/history-charts.tsx"), "utf8");
  assert.match(charts, /Never pass Unix timestamps as `x`/);
  assert.equal(charts.includes("x: point.at"), false);
  assert.equal(/from "react-native".*FlatList|FlatList,/.test(charts), false);
  assert.match(charts, /Plain views — FlatList nested/);
  assert.match(charts, /ChartSafeBoundary/);
  assert.match(charts, /sanitizePlotPointsForNative/);
  const layout = readFileSync(join(root, "app/_layout.tsx"), "utf8");
  assert.match(layout, /export \{ ErrorBoundary \} from "expo-router"/);
});
