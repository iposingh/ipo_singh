import type { GmpHistoryWindow, GmpObservation } from "@ipo-singh/contracts";
import { formatInr, formatIstDate, formatIstDateTime, formatSignedPercent, isPresentNumber, istCalendarDate, istDateAnchor } from "@ipo-singh/core";

export const dailyMaxGapMs = 36 * 60 * 60 * 1000;
export const intradayMaxGapMs = 7 * 60 * 60 * 1000;

export type GmpChartPoint = {
  at: number;
  amountRupees: number;
  percent: number | null;
  tooltip: string;
  /** Full IST label for the table and tooltip. Daily points stay date-only. */
  axisLabel: string;
  /** Short axis tick. A clock is used only when the observation has one. */
  tickLabel: string;
  high: boolean;
  low: boolean;
};

export type ChartSeriesPoint = {
  at: number;
  value: number;
  series: number;
  tooltip: string;
  axisLabel: string;
  tickLabel: string;
  high: boolean;
  low: boolean;
};

export type PlacedGmpPoint = GmpChartPoint & { x: number; y: number };

export type GmpChartLayout = {
  width: number;
  height: number;
  points: PlacedGmpPoint[];
  segments: { x1: number; y1: number; x2: number; y2: number }[];
  zeroY: number | null;
};

const chartWidth = 320;
const chartHeight = 140;

/** Daily trend points. A date-only series is not given a displayed clock. Current snapshots stay off the chart once real history exists. */
export function dailyGmpPoints(observations: readonly GmpObservation[], window: GmpHistoryWindow | null = null): GmpChartPoint[] {
  const dated = observations.filter((point) => point.session === "daily" && point.observedOn && isPresentNumber(point.amountRupees));
  const source =
    dated.length > 0 ? dated : observations.filter((point) => point.session === "daily" && isPresentNumber(point.amountRupees));
  return source.flatMap((point) => {
    const at = point.observedOn ? istDateAnchor(point.observedOn)?.getTime() : Date.parse(point.observedAt);
    if (at === undefined || Number.isNaN(at) || !isPresentNumber(point.amountRupees)) return [];
    const day = point.observedOn ?? istCalendarDate(new Date(point.observedAt));
    const when = point.observedOn ? formatIstDate(point.observedOn) : formatIstDateTime(new Date(point.observedAt));
    return [place(point.amountRupees, point.percent, at, when, null, day, window)];
  });
}

/** Pro intraday points. Gaps stay empty. No intermediate slot is created. */
export function intradayGmpPoints(observations: readonly GmpObservation[], window: GmpHistoryWindow | null = null): GmpChartPoint[] {
  return observations.flatMap((point) => {
    if (point.session !== "intraday" || !isPresentNumber(point.amountRupees)) return [];
    const at = Date.parse(point.observedAt);
    if (Number.isNaN(at)) return [];
    const when = formatIstDateTime(new Date(point.observedAt));
    return [place(point.amountRupees, point.percent, at, when, point.slotLabel ?? null, point.observedOn ?? istCalendarDate(new Date(at)), window)];
  });
}

/**
 * Places observed points on a time axis.
 * A line is drawn only between neighbours inside `maxGapMs`. A missing day or slot is not bridged.
 */
export function layoutGmpChart(points: readonly GmpChartPoint[], maxGapMs: number): GmpChartLayout {
  const ordered = [...points].sort((left, right) => left.at - right.at || left.amountRupees - right.amountRupees);
  const width = chartWidth;
  const height = chartHeight;
  if (ordered.length === 0) return { width, height, points: [], segments: [], zeroY: null };
  const amounts = ordered.map((point) => point.amountRupees);
  const min = Math.min(...amounts, 0);
  const max = Math.max(...amounts, 0);
  const span = max - min || 1;
  const first = ordered[0]?.at ?? 0;
  const last = ordered[ordered.length - 1]?.at ?? first;
  const timeSpan = last - first;
  const placed = ordered.map((point) => {
    const x = timeSpan === 0 ? width / 2 : ((point.at - first) / timeSpan) * (width - 24) + 12;
    const y = height - ((point.amountRupees - min) / span) * (height - 16) - 8;
    return { ...point, x, y };
  });
  const segments: GmpChartLayout["segments"] = [];
  for (let index = 1; index < placed.length; index += 1) {
    const previous = placed[index - 1];
    const current = placed[index];
    if (!previous || !current) continue;
    if (current.at - previous.at <= 0 || current.at - previous.at > maxGapMs) continue;
    segments.push({ x1: previous.x, y1: previous.y, x2: current.x, y2: current.y });
  }
  const zeroY = min < 0 && max > 0 ? height - ((0 - min) / span) * (height - 16) - 8 : null;
  return { width, height, points: placed, segments, zeroY };
}

/**
 * One row per real observation. A gap starts a new series so the chart does not draw a line across a missing day or slot.
 * No placeholder row is inserted, so a missing reading cannot appear as zero.
 */
export function chartSeries(points: readonly GmpChartPoint[], maxGapMs: number): ChartSeriesPoint[] {
  const ordered = [...points].sort((left, right) => left.at - right.at || left.amountRupees - right.amountRupees);
  let series = 0;
  return ordered.map((point, index) => {
    const previous = ordered[index - 1];
    if (previous && (point.at - previous.at <= 0 || point.at - previous.at > maxGapMs)) series += 1;
    return {
      at: point.at,
      value: point.amountRupees,
      series,
      tooltip: point.tooltip,
      axisLabel: point.axisLabel,
      tickLabel: point.tickLabel,
      high: point.high,
      low: point.low,
    };
  });
}

/** Axis ticks stay on real observation times. Intermediate times are not invented. */
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

function place(
  amountRupees: number,
  percent: number | null,
  at: number,
  when: string,
  slotLabel: string | null,
  day: string | null,
  window: GmpHistoryWindow | null,
): GmpChartPoint {
  const high = matchesExtreme(window?.high, day, amountRupees);
  const low = matchesExtreme(window?.low, day, amountRupees);
  const slot = slotLabel ? ` · ${slotLabel}` : "";
  const percentText = percent === null ? "Percent unavailable" : formatSignedPercent(percent);
  const marker = [high ? "High" : null, low ? "Low" : null].filter(Boolean).join(", ");
  const markerText = marker ? ` · ${marker}` : "";
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

export function tickLabelFor(when: string, slotLabel: string | null): string {
  if (slotLabel) return slotLabel;
  const clock = when.match(/(\d{1,2}:\d{2} [AP]M)/);
  if (clock?.[1]) return clock[1];
  return when.replace(/ \d{4}$/, "");
}

function matchesExtreme(extreme: GmpHistoryWindow["high"] | undefined, day: string | null, amountRupees: number): boolean {
  if (!extreme || !day || extreme.observedOn !== day) return false;
  return Math.abs(extreme.amountRupees - amountRupees) <= 0.05;
}
