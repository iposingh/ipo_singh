"use client";

import { memo } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatSubscriptionMultiple } from "@ipo-singh/core";
import type { CategoryBar } from "@/features/ipo-details/subscription-chart";

function sameBars(left: readonly CategoryBar[], right: readonly CategoryBar[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((bar, index) => {
    const other = right[index];
    return other !== undefined && bar.key === other.key && bar.times === other.times;
  });
}

function CategoryTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: CategoryBar }> }) {
  const bar = active ? payload?.[0]?.payload : undefined;
  if (!bar) return null;
  return (
    <div className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-card">
      {bar.label}: {formatSubscriptionMultiple(bar.times)}
    </div>
  );
}

export const CategoryComparisonChart = memo(
  function CategoryComparisonChart({ bars }: { bars: readonly CategoryBar[] }) {
    const height = Math.max(160, bars.length * 36 + 24);
    const data = bars.map((bar) => ({ ...bar, axis: `${bar.label} · ${formatSubscriptionMultiple(bar.times)}` }));
    return (
      <figure className="grid min-w-0 gap-3">
        <figcaption className="text-sm font-semibold text-foreground">Category comparison</figcaption>
        <p className="text-sm text-muted">Stored subscription multiples. A missing category is left off this chart and is not drawn as 0x.</p>
        <div className="w-full min-w-0 touch-manipulation" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height }}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }} accessibilityLayer>
              <XAxis type="number" hide domain={[0, (max: number) => (max > 0 ? max : 1)]} />
              <YAxis
                type="category"
                dataKey="axis"
                width={148}
                tick={{ fill: "var(--color-foreground)", fontSize: 12 }}
                stroke="var(--color-border)"
              />
              <Tooltip content={<CategoryTooltip />} cursor={{ fill: "var(--color-border)", opacity: 0.35 }} isAnimationActive={false} wrapperStyle={{ pointerEvents: "none" }} />
              <Bar dataKey="times" fill="var(--color-link)" isAnimationActive={false} radius={4} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="sr-only">
          {bars.map((bar) => (
            <li key={bar.key}>
              {bar.label}: {formatSubscriptionMultiple(bar.times)}
            </li>
          ))}
        </ul>
      </figure>
    );
  },
  (left, right) => sameBars(left.bars, right.bars),
);
