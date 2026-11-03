"use client";

import { memo, useMemo, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatInr, formatSubscriptionMultiple } from "@ipo-singh/core";
import { chartSeries, chartTicks, type GmpChartPoint } from "@/features/ipo-details/gmp-chart";

type ChartKind = "inr" | "times";

type ChartDatum = {
  at: number;
  tooltip: string;
  tickLabel: string;
  value: number;
  high: boolean;
  low: boolean;
} & Record<string, number | string | boolean | undefined>;

function formatValue(kind: ChartKind, value: number): string {
  return kind === "inr" ? formatInr(value) : formatSubscriptionMultiple(value);
}

function valueDomain(values: readonly number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  return min === max ? [min, min + 1] : [min, max];
}

function samePoints(left: readonly GmpChartPoint[], right: readonly GmpChartPoint[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((point, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      point.at === other.at &&
      point.amountRupees === other.amountRupees &&
      point.tooltip === other.tooltip &&
      point.high === other.high &&
      point.low === other.low
    );
  });
}

function SeriesDot({ cx, cy, payload, value }: { cx?: number; cy?: number; payload?: ChartDatum; value?: number | null }) {
  if (value == null || cx == null || cy == null || !payload) return null;
  const fill = payload.high ? "var(--color-positive)" : payload.low ? "var(--color-negative)" : "var(--color-link)";
  return <circle cx={cx} cy={cy} r={payload.high || payload.low ? 5 : 3.5} fill={fill} />;
}

function ReadingTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: ChartDatum }> }) {
  const text = active ? payload?.find((item) => item.payload?.tooltip)?.payload?.tooltip : null;
  if (!text) return null;
  return <div className="max-w-xs rounded-control border border-border bg-surface px-3 py-2 text-sm leading-5 text-foreground shadow-card">{text}</div>;
}

export const ObservationChart = memo(
  function ObservationChart({ points, maxGapMs, kind, label }: { points: readonly GmpChartPoint[]; maxGapMs: number; kind: ChartKind; label: string }) {
    const model = useMemo(() => {
      const series = chartSeries(points, maxGapMs);
      const seriesIds = [...new Set(series.map((point) => point.series))];
      const data: ChartDatum[] = series.map((point) => ({
        at: point.at,
        tooltip: point.tooltip,
        tickLabel: point.tickLabel,
        value: point.value,
        high: point.high,
        low: point.low,
        [`s${point.series}`]: point.value,
      }));
      return { data, seriesIds, ticks: chartTicks(series) };
    }, [points, maxGapMs]);
    const domain = valueDomain(model.data.map((point) => point.value));
    const tickLabel = (at: number) => model.data.find((point) => point.at === at)?.tickLabel ?? "";

    return (
      <div className="min-w-0">
        <div className="h-56 w-full min-w-0 touch-manipulation">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 224 }}>
            <LineChart data={model.data} margin={{ top: 12, right: 20, left: 0, bottom: 4 }} accessibilityLayer>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="at"
                type="number"
                domain={["dataMin", "dataMax"]}
                padding={{ left: 16, right: 36 }}
                ticks={model.ticks}
                tickFormatter={tickLabel}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                stroke="var(--color-border)"
                interval={0}
              />
              <YAxis
                domain={domain}
                width={72}
                tickFormatter={(value: number) => formatValue(kind, value)}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                stroke="var(--color-border)"
              />
              <Tooltip
                content={<ReadingTooltip />}
                cursor={{ stroke: "var(--color-border)" }}
                isAnimationActive={false}
                wrapperStyle={{ pointerEvents: "none" }}
              />
              {model.seriesIds.map((series) => (
                <Line
                  key={series}
                  type="linear"
                  dataKey={`s${series}`}
                  name={label}
                  stroke="var(--color-link)"
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={SeriesDot}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  },
  (left, right) => left.kind === right.kind && left.maxGapMs === right.maxGapMs && left.label === right.label && samePoints(left.points, right.points),
);

export function ChartFrame({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <figure className="grid min-w-0 gap-3">
      <figcaption className="text-sm font-semibold text-foreground">{title}</figcaption>
      <p className="text-sm text-muted">{note}</p>
      {children}
    </figure>
  );
}
