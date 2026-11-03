import type { SourceFinancials } from "@ipo-singh/contracts";
import { sourceFinancialSeries } from "@/features/ipo-details/source-financials";

export function SourceFinancialChart({ financials, rowIndex }: { financials: SourceFinancials; rowIndex: number }) {
  const row = financials.rows[rowIndex];
  const points = sourceFinancialSeries(financials, rowIndex);
  if (!row || points.length < 2) return null;
  const peak = Math.max(...points.map((point) => Math.abs(point.value)), 1);
  const label = financials.unit ? `${row.metric} (${financials.unit})` : row.metric;
  return (
    <figure className="grid gap-3" aria-label={label}>
      <figcaption className="text-sm font-medium text-foreground">{label}</figcaption>
      <ul className="grid gap-2">
        {points.map((point) => (
          <li key={point.label} className="grid grid-cols-1 items-center gap-1 text-sm sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:gap-3">
            <span className="text-muted">{point.label}</span>
            <span className="block h-3 rounded-control bg-muted/30">
              <span
                className="block h-3 rounded-control bg-primary-solid"
                style={{ width: `${Math.max(4, (Math.abs(point.value) / peak) * 100)}%` }}
              />
            </span>
            <span className="tabular-nums text-foreground">{point.value.toLocaleString("en-IN")}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
