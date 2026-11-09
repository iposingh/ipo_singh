import type { GmpHistoryWindow, GmpObservation, Provenance, SubscriptionSnapshot } from "@ipo-singh/contracts";
import {
  formatInr,
  formatIstDate,
  formatIstDateTime,
  formatSignedPercent,
  formatSubscriptionMultiple,
  isPresentNumber,
  istCalendarDate,
  istDateAnchor,
  unofficialGmpDisclaimer,
} from "@ipo-singh/core";
import { layout } from "@ipo-singh/design-tokens";
import { pagePadding } from "../design/layout.ts";

export const dailyMaxGapMs = 36 * 60 * 60 * 1000;
export const intradayMaxGapMs = 7 * 60 * 60 * 1000;
export const subscriptionDayGapMs = 36 * 60 * 60 * 1000;
export const lineChartMinimumPoints = 2;
const dayMs = 24 * 60 * 60 * 1000;

export type HistoryRangeKey = "7d" | "30d" | "all";

export const historyRangeChoices: readonly { key: HistoryRangeKey; label: string; ms: number | null }[] = [
  { key: "all", label: "All stored", ms: null },
  { key: "30d", label: "Last 30 days", ms: 30 * dayMs },
  { key: "7d", label: "Last 7 days", ms: 7 * dayMs },
];

const categoryLabels: Record<string, string> = {
  TOTAL: "Total",
  RETAIL: "Retail",
  QIB: "QIB",
  NII: "NII / HNI",
  HNI: "HNI",
  EMPLOYEE: "Employee",
  SHAREHOLDER: "Shareholder",
  ANCHOR: "Anchor",
  FII: "FII",
  DFI: "DFI",
  MF: "Mutual funds",
  OTHERS: "Others",
  BNII: "bNII",
  BNII_CORP: "bNII corporates",
  BNII_IND: "bNII individuals",
  BNII_OTHERS: "bNII others",
  SNII: "sNII",
  SNII_CORP: "sNII corporates",
  SNII_IND: "sNII individuals",
  SNII_OTHERS: "sNII others",
  CUTOFF: "Cut-off bids",
  PRICE: "Price bids",
};

const requiredSeries = ["TOTAL", "RETAIL", "QIB", "NII"] as const;
const optionalSeries = ["EMPLOYEE", "SHAREHOLDER", "ANCHOR"] as const;

export type GmpChartPoint = {
  at: number;
  amountRupees: number;
  percent: number | null;
  tooltip: string;
  axisLabel: string;
  tickLabel: string;
  high: boolean;
  low: boolean;
};

export type PlotPoint = {
  at: number;
  value: number;
  tooltip: string;
  tickLabel: string;
  high: boolean;
  low: boolean;
  series: number;
};

export type CategoryBar = {
  key: string;
  label: string;
  times: number;
};

export type ReadingRow = {
  key: string;
  when: string;
  amount: string;
  percent: string;
  mark: string;
};

export type SubscriptionColumn = {
  key: string;
  label: string;
};

export type SubscriptionTable = {
  columns: SubscriptionColumn[];
  rows: { key: string; cells: string[] }[];
};

export function chartFrameWidth(screenWidth: number): number {
  const padding = pagePadding(screenWidth);
  const inner = Math.min(screenWidth, layout.contentMaxWidth) - padding * 2;
  return Math.max(160, Math.floor(inner));
}

export function categoryLabel(key: string): string {
  return categoryLabels[key] ?? key;
}

/** A line needs at least two stored observations. A single reading stays in the table only. */
export function canDrawLineChart(count: number): boolean {
  return count >= lineChartMinimumPoints;
}

/**
 * Soft cap for native line rendering. Tables still list every stored reading.
 * Very long polylines have overflowed Android SVG path buffers on release builds.
 */
export const chartRenderPointLimit = 64;

/**
 * Gifted-charts data points for IPO history. Omits custom `x` so layout uses index spacing.
 * Absolute Unix timestamps as `x` have crashed Android release builds (native SVG overflow).
 */
export function lineChartDataPoints(
  points: readonly PlotPoint[],
  tickAts: ReadonlySet<number>,
): { value: number; label: string }[] {
  return points
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.at))
    .map((point) => ({
      value: point.value,
      label: tickAts.has(point.at) ? point.tickLabel : "",
    }));
}

/** Drop NaN / Infinity before gifted-charts mounts; optionally thin dense series for SVG safety. */
export function sanitizePlotPointsForNative(
  points: readonly PlotPoint[],
  limit = chartRenderPointLimit,
): PlotPoint[] {
  const finite = points.filter((point) => Number.isFinite(point.value) && Number.isFinite(point.at));
  if (finite.length <= limit) return finite;
  const last = finite.length - 1;
  const indexes = new Set<number>([0, last]);
  const steps = limit - 1;
  for (let step = 1; step < steps; step += 1) indexes.add(Math.round((last * step) / steps));
  return [...indexes]
    .sort((left, right) => left - right)
    .flatMap((index) => {
      const point = finite[index];
      return point ? [point] : [];
    });
}

/** Reject non-finite chart frame sizes before native chart views mount. */
export function safeChartFrameWidth(width: number): number {
  if (!Number.isFinite(width) || width < 120) return 160;
  return Math.floor(width);
}

/** Finite gifted-charts `spacing` — never NaN/Infinity into native SVG layout. */
export function safeChartSpacing(frameWidth: number, pointCount: number): number {
  if (!Number.isFinite(frameWidth) || !Number.isFinite(pointCount) || pointCount <= 0) return 8;
  const width = safeChartFrameWidth(frameWidth);
  const count = Math.floor(pointCount);
  const spacing = Math.max(8, (width - 72) / Math.max(count, 2));
  return Number.isFinite(spacing) && spacing > 0 ? spacing : 8;
}

/** Category bars and a finite Y max for BarChart (avoids Infinity/`NaN` native layout). */
export function sanitizeCategoryBarsForNative(bars: readonly CategoryBar[]): {
  bars: CategoryBar[];
  maxValue: number;
} {
  const clean = bars.filter((bar) => Number.isFinite(bar.times) && bar.times >= 0);
  const peak = clean.reduce((highest, bar) => Math.max(highest, bar.times), 0);
  if (!Number.isFinite(peak) || peak <= 0) return { bars: clean, maxValue: 1 };
  const padded = peak * 1.15;
  return {
    bars: clean,
    maxValue: Number.isFinite(padded) ? padded : peak,
  };
}

export function historyRangeMs(range: HistoryRangeKey): number | null {
  return historyRangeChoices.find((choice) => choice.key === range)?.ms ?? null;
}

/**
 * Ranges that can show at least one stored timestamp.
 * Does not invent windows beyond the stored span; "All stored" is always offered when any points exist.
 */
export function availableHistoryRanges(timestamps: readonly number[]): HistoryRangeKey[] {
  const valid = timestamps.filter((at) => Number.isFinite(at));
  if (valid.length === 0) return ["all"];
  const newest = Math.max(...valid);
  const oldest = Math.min(...valid);
  const keys: HistoryRangeKey[] = ["all"];
  if (newest - oldest > 7 * dayMs || valid.some((at) => newest - at <= 30 * dayMs && newest - at > 7 * dayMs)) {
    keys.push("30d");
  }
  if (valid.length > 1 || newest - oldest > 0) keys.push("7d");
  return keys;
}

/** Keep observations inside the newest stored window. Missing or unparseable times are dropped, never invented. */
export function clipGmpObservations(observations: readonly GmpObservation[], range: HistoryRangeKey): GmpObservation[] {
  const ordered = chronologicalGmp(observations);
  const ms = historyRangeMs(range);
  if (ms === null) return ordered;
  const times = ordered.map((row) => Date.parse(row.observedAt)).filter((at) => !Number.isNaN(at));
  if (times.length === 0) return [];
  const start = Math.max(...times) - ms;
  return ordered.filter((row) => {
    const at = Date.parse(row.observedAt);
    return !Number.isNaN(at) && at >= start;
  });
}

export function clipSubscriptionObservations(
  observations: readonly SubscriptionSnapshot[],
  range: HistoryRangeKey,
): SubscriptionSnapshot[] {
  const ordered = chronologicalSubscription(observations);
  const ms = historyRangeMs(range);
  if (ms === null) return ordered;
  const times = ordered.flatMap((row) => {
    const at = observationTime(row);
    return at === null ? [] : [at];
  });
  if (times.length === 0) return [];
  const start = Math.max(...times) - ms;
  return ordered.filter((row) => {
    const at = observationTime(row);
    return at !== null && at >= start;
  });
}

export function chronologicalGmp(observations: readonly GmpObservation[]): GmpObservation[] {
  return [...observations].sort((left, right) => {
    const leftAt = Date.parse(left.observedAt);
    const rightAt = Date.parse(right.observedAt);
    if (Number.isNaN(leftAt) && Number.isNaN(rightAt)) return 0;
    if (Number.isNaN(leftAt)) return 1;
    if (Number.isNaN(rightAt)) return -1;
    if (leftAt !== rightAt) return leftAt - rightAt;
    return (left.observedOn ?? "").localeCompare(right.observedOn ?? "");
  });
}

export function chronologicalSubscription(observations: readonly SubscriptionSnapshot[]): SubscriptionSnapshot[] {
  return [...observations].sort((left, right) => {
    const leftAt = observationTime(left) ?? Number.MAX_SAFE_INTEGER;
    const rightAt = observationTime(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftAt !== rightAt) return leftAt - rightAt;
    return (left.observedOn ?? "").localeCompare(right.observedOn ?? "");
  });
}

export function historyProvenanceText(provenance: Pick<Provenance, "sourceName" | "retrievedAt">): string {
  const retrieved =
    provenance.retrievedAt && !Number.isNaN(Date.parse(provenance.retrievedAt))
      ? formatIstDateTime(new Date(provenance.retrievedAt))
      : "Unavailable";
  return `Source: ${provenance.sourceName}. Retrieved ${retrieved}. Indicative grey-market figures are unofficial and are not exchange data.`;
}

export function dailyGmpPoints(observations: readonly GmpObservation[], historyWindow: GmpHistoryWindow | null = null): GmpChartPoint[] {
  const dated = observations.filter((point) => point.session === "daily" && point.observedOn && isPresentNumber(point.amountRupees));
  const source = dated.length > 0 ? dated : observations.filter((point) => point.session === "daily" && isPresentNumber(point.amountRupees));
  return source.flatMap((point) => {
    const at = point.observedOn ? istDateAnchor(point.observedOn)?.getTime() : Date.parse(point.observedAt);
    if (at === undefined || Number.isNaN(at) || !isPresentNumber(point.amountRupees)) return [];
    const day = point.observedOn ?? istCalendarDate(new Date(point.observedAt));
    const when = point.observedOn ? formatIstDate(point.observedOn) : formatIstDateTime(new Date(point.observedAt));
    return [placeGmp(point.amountRupees, point.percent, at, when, null, day, historyWindow)];
  });
}

export function intradayGmpPoints(observations: readonly GmpObservation[], historyWindow: GmpHistoryWindow | null = null): GmpChartPoint[] {
  return observations.flatMap((point) => {
    if (point.session !== "intraday" || !isPresentNumber(point.amountRupees)) return [];
    const at = Date.parse(point.observedAt);
    if (Number.isNaN(at)) return [];
    const when = formatIstDateTime(new Date(point.observedAt));
    return [placeGmp(point.amountRupees, point.percent, at, when, point.slotLabel ?? null, point.observedOn ?? istCalendarDate(new Date(at)), historyWindow)];
  });
}

export function gmpRupeePlot(points: readonly GmpChartPoint[], maxGapMs: number): PlotPoint[] {
  return connectAmounts(points, maxGapMs);
}

export function gmpPercentPlot(points: readonly GmpChartPoint[], maxGapMs: number): PlotPoint[] {
  const ordered = [...points].sort((left, right) => left.at - right.at || left.amountRupees - right.amountRupees);
  let series = 0;
  const plotted: PlotPoint[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const point = ordered[index];
    if (!point) continue;
    const previous = ordered[index - 1];
    const gap = previous !== undefined && (point.at - previous.at <= 0 || point.at - previous.at > maxGapMs);
    if (gap || point.percent === null) series += 1;
    if (point.percent === null) continue;
    plotted.push({
      at: point.at,
      value: point.percent,
      tooltip: point.tooltip,
      tickLabel: point.tickLabel,
      high: point.high,
      low: point.low,
      series,
    });
  }
  return plotted;
}

export function chartTicks(points: readonly { at: number }[], limit = 4): number[] {
  if (points.length === 0) return [];
  if (points.length <= limit) return points.map((point) => point.at);
  const last = points.length - 1;
  const indexes = new Set<number>([0, last]);
  const steps = limit - 1;
  for (let step = 1; step < steps; step += 1) indexes.add(Math.round((last * step) / steps));
  return [...indexes].sort((left, right) => left - right).flatMap((index) => {
    const at = points[index]?.at;
    return at === undefined ? [] : [at];
  });
}

export function plotBands(points: readonly PlotPoint[]): PlotPoint[][] {
  const bands: PlotPoint[][] = [];
  for (const point of points) {
    const band = bands[bands.length - 1];
    if (!band || band[0]?.series !== point.series) bands.push([point]);
    else band.push(point);
  }
  return bands;
}

export function gmpTableRows(points: readonly GmpChartPoint[]): ReadingRow[] {
  return [...points]
    .sort((left, right) => left.at - right.at || left.amountRupees - right.amountRupees)
    .map((point) => ({
      key: `${point.at}-${point.amountRupees}`,
      when: point.axisLabel,
      amount: formatInr(point.amountRupees),
      percent: point.percent === null ? "Unavailable" : formatSignedPercent(point.percent),
      mark: markLabel(point.high, point.low),
    }));
}

export function gmpHistorySummary(title: string, count: number, historyWindow: GmpHistoryWindow | null): string {
  const partial = historyWindow?.truncated ? " This history is partial." : "";
  return `${title}. ${readingCountLabel(count)} ${extremeText("High", historyWindow?.high ?? null)}. ${extremeText("Low", historyWindow?.low ?? null)}.${partial} ${unofficialGmpDisclaimer} This chart is not a guaranteed return.`;
}

export function subscriptionPlot(observations: readonly SubscriptionSnapshot[], key: string): PlotPoint[] {
  const points = observations.flatMap((point) => {
    const times = timesFor(point, key);
    if (!isPresentNumber(times)) return [];
    const clock = point.observedAt ? new Date(point.observedAt) : null;
    const hasClock = clock instanceof Date && !Number.isNaN(clock.getTime());
    const anchor = point.observedOn ? istDateAnchor(point.observedOn) : null;
    const at = hasClock ? clock.getTime() : anchor?.getTime();
    if (at === undefined || Number.isNaN(at)) return [];
    const when = hasClock ? formatIstDateTime(clock) : formatIstDate(point.observedOn);
    return [
      {
        at,
        amountRupees: times,
        percent: null,
        axisLabel: when,
        tickLabel: tickLabelFor(when, null),
        tooltip: `${when} · ${categoryLabel(key)} ${formatSubscriptionMultiple(times)}`,
        high: false,
        low: false,
      },
    ];
  });
  return connectAmounts(points, subscriptionDayGapMs);
}

export function subscriptionSeriesChoices(
  observations: readonly SubscriptionSnapshot[],
  snapshot: SubscriptionSnapshot | null,
): { key: string; label: string }[] {
  const present = new Set<string>();
  for (const row of [snapshot, ...observations]) {
    if (!row) continue;
    for (const key of [...requiredSeries, ...optionalSeries]) {
      if (isPresentNumber(timesFor(row, key))) present.add(key);
    }
    for (const category of row.categories ?? []) {
      if (isPresentNumber(category.times)) present.add(category.key);
    }
  }
  const keys = [
    ...requiredSeries,
    ...optionalSeries.filter((key) => present.has(key)),
    ...[...present].filter((key) => !requiredSeries.includes(key as (typeof requiredSeries)[number]) && !optionalSeries.includes(key as (typeof optionalSeries)[number])),
  ];
  return keys.map((key) => ({ key, label: categoryLabel(key) }));
}

export function subscriptionCategoryBars(snapshot: SubscriptionSnapshot | null | undefined): CategoryBar[] {
  if (!snapshot) return [];
  const seen = new Set<string>();
  const bars: CategoryBar[] = [];
  for (const key of [...requiredSeries, ...optionalSeries]) {
    const times = timesFor(snapshot, key);
    if (!isPresentNumber(times)) continue;
    bars.push({ key, label: categoryLabel(key), times });
    seen.add(key);
  }
  for (const category of snapshot.categories ?? []) {
    if (seen.has(category.key) || !isPresentNumber(category.times)) continue;
    bars.push({ key: category.key, label: categoryLabel(category.key), times: category.times });
    seen.add(category.key);
  }
  return bars;
}

export function subscriptionTable(observations: readonly SubscriptionSnapshot[]): SubscriptionTable {
  const ordered = chronologicalSubscription(observations);
  const columns: SubscriptionColumn[] = [
    { key: "day", label: "Day" },
    { key: "TOTAL", label: "Total" },
    { key: "RETAIL", label: "Retail" },
    { key: "QIB", label: "QIB" },
    { key: "NII", label: "NII" },
  ];
  for (const key of optionalSeries) {
    if (ordered.some((row) => supplied(row, key))) columns.push({ key, label: categoryLabel(key) });
  }
  const known = new Set(columns.map((column) => column.key));
  for (const row of ordered) {
    for (const category of row.categories ?? []) {
      if (known.has(category.key) || !isPresentNumber(category.times)) continue;
      columns.push({ key: category.key, label: categoryLabel(category.key) });
      known.add(category.key);
    }
  }
  return {
    columns,
    rows: ordered.map((row, index) => ({
      key: `${row.observedOn ?? "day"}-${row.observedAt ?? "none"}-${row.biddingDay ?? "x"}-${index}`,
      cells: columns.map((column) => {
        if (column.key === "day") return dayLabel(row);
        return formatSubscriptionMultiple(timesFor(row, column.key));
      }),
    })),
  };
}

export function subscriptionHistorySummary(label: string, count: number): string {
  return `${label} subscription. ${readingCountLabel(count)} A missing day is left blank and is not plotted as zero. A published zero stays 0x.`;
}

export function categoryComparisonSummary(bars: readonly CategoryBar[]): string {
  if (bars.length === 0) return "No category comparison is stored.";
  return `Category comparison. ${bars.map((bar) => `${bar.label} ${formatSubscriptionMultiple(bar.times)}`).join(", ")}.`;
}

function connectAmounts(points: readonly GmpChartPoint[], maxGapMs: number): PlotPoint[] {
  const ordered = [...points].sort((left, right) => left.at - right.at || left.amountRupees - right.amountRupees);
  let series = 0;
  return ordered.map((point, index) => {
    const previous = ordered[index - 1];
    if (previous && (point.at - previous.at <= 0 || point.at - previous.at > maxGapMs)) series += 1;
    return {
      at: point.at,
      value: point.amountRupees,
      tooltip: point.tooltip,
      tickLabel: point.tickLabel,
      high: point.high,
      low: point.low,
      series,
    };
  });
}

function placeGmp(
  amountRupees: number,
  percent: number | null,
  at: number,
  when: string,
  slotLabel: string | null,
  day: string | null,
  historyWindow: GmpHistoryWindow | null,
): GmpChartPoint {
  const high = matchesExtreme(historyWindow?.high, day, amountRupees);
  const low = matchesExtreme(historyWindow?.low, day, amountRupees);
  const slot = slotLabel ? ` · ${slotLabel}` : "";
  const percentText = percent === null ? "Percent unavailable" : formatSignedPercent(percent);
  const marker = markLabel(high, low);
  const markerText = marker === "None" ? "" : ` · ${marker}`;
  return {
    at,
    amountRupees,
    percent,
    axisLabel: when,
    tickLabel: tickLabelFor(when, slotLabel),
    tooltip: `${when}${slot} · ${formatInr(amountRupees)} · ${percentText}${markerText}`,
    high,
    low,
  };
}

function tickLabelFor(when: string, slotLabel: string | null): string {
  if (slotLabel) return slotLabel;
  const clock = when.match(/(\d{1,2}:\d{2} [AP]M)/);
  if (clock?.[1]) return clock[1];
  return when.replace(/ \d{4}$/, "");
}

function matchesExtreme(extreme: GmpHistoryWindow["high"] | undefined, day: string | null, amountRupees: number): boolean {
  if (!extreme || !day || extreme.observedOn !== day) return false;
  return Math.abs(extreme.amountRupees - amountRupees) <= 0.05;
}

function markLabel(high: boolean, low: boolean): string {
  const mark = [high ? "High" : null, low ? "Low" : null].filter(Boolean).join(", ");
  return mark || "None";
}

function extremeText(label: string, extreme: GmpHistoryWindow["high"] | null): string {
  if (!extreme) return `${label} unavailable`;
  return `${label} ${formatInr(extreme.amountRupees)} on ${formatIstDate(extreme.observedOn)}`;
}

function readingCountLabel(count: number): string {
  if (count === 0) return "No stored readings.";
  if (count === 1) return "1 stored reading.";
  return `${count} stored readings.`;
}

function timesFor(snapshot: SubscriptionSnapshot, key: string): number | null | undefined {
  if (key === "TOTAL") return snapshot.totalTimes;
  const category = snapshot.categories?.find((item) => item.key === key);
  if (category) return category.times;
  if (key === "RETAIL") return snapshot.retailTimes;
  if (key === "QIB") return snapshot.qibTimes;
  if (key === "NII") return snapshot.niiTimes;
  if (key === "EMPLOYEE") return snapshot.employeeTimes;
  if (key === "SHAREHOLDER") return snapshot.shareholderTimes;
  if (key === "ANCHOR") return snapshot.anchorTimes;
  return null;
}

function supplied(row: SubscriptionSnapshot, key: (typeof optionalSeries)[number]): boolean {
  if (row.categories?.some((category) => category.key === key)) return true;
  return isPresentNumber(timesFor(row, key));
}

function observationTime(point: SubscriptionSnapshot): number | null {
  if (point.observedAt) {
    const at = Date.parse(point.observedAt);
    if (!Number.isNaN(at)) return at;
  }
  if (point.observedOn) return istDateAnchor(point.observedOn)?.getTime() ?? null;
  return null;
}

function dayLabel(point: SubscriptionSnapshot): string {
  if (point.observedOn) return formatIstDate(point.observedOn);
  if (point.observedAt) return formatIstDateTime(new Date(point.observedAt));
  return "Unavailable";
}
