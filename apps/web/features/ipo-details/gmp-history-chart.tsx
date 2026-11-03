"use client";

import { formatInr, formatIstDate, formatSignedPercent } from "@ipo-singh/core";
import type { GmpHistoryWindow } from "@ipo-singh/contracts";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Table, type TableColumn } from "@/components/ui/table";
import { type GmpChartPoint } from "@/features/ipo-details/gmp-chart";
import { ChartFrame, ObservationChart } from "@/features/ipo-details/observation-chart";

const gmpNote = "Unofficial grey-market premium in rupees. Missing observations are not connected and are not drawn as ₹0. This chart is not the listing gain.";

export function GmpHistoryChart({
  title,
  points,
  maxGapMs,
  emptyDescription,
  status = "ready",
  window = null,
  sourceName = null,
  updatedLabel = null,
}: {
  title: string;
  points: readonly GmpChartPoint[];
  maxGapMs: number;
  emptyDescription: string;
  status?: "ready" | "unavailable" | "loading";
  window?: GmpHistoryWindow | null;
  sourceName?: string | null;
  updatedLabel?: string | null;
}) {
  if (status === "loading") {
    return (
      <figure className="rounded-panel border border-border bg-surface px-5 py-8">
        <figcaption className="text-sm font-semibold text-foreground">{title}</figcaption>
        <div className="mt-3">
          <LoadingState label={`Loading ${title}`} />
        </div>
      </figure>
    );
  }
  if (status === "unavailable") {
    return <ErrorState title={`${title} could not be loaded`} message="IPO Singh could not read this GMP history. No sample points were added." />;
  }
  if (points.length === 0) {
    return (
      <figure className="rounded-panel border border-dashed border-border bg-surface px-5 py-8">
        <figcaption className="text-sm font-semibold text-foreground">{title}</figcaption>
        <p className="mt-2 text-sm leading-6 text-muted">{emptyDescription}</p>
        <ExtremeLine window={window} />
        <Provenance sourceName={sourceName} updatedLabel={updatedLabel} />
      </figure>
    );
  }

  return (
    <ChartFrame title={title} note={gmpNote}>
      <ExtremeLine window={window} />
      <ObservationChart points={points} maxGapMs={maxGapMs} kind="inr" label={title} />
      <p className="text-sm text-muted">Tap a point for its rupee amount, percentage, and IST time. The table lists the same observations.</p>
      <Provenance sourceName={sourceName} updatedLabel={updatedLabel} />
      <ReadingTable points={points} />
    </ChartFrame>
  );
}

function ReadingTable({ points }: { points: readonly GmpChartPoint[] }) {
  const columns: TableColumn<GmpChartPoint>[] = [
    { id: "when", header: "Observed (IST)", cell: (row) => row.axisLabel },
    { id: "amount", header: "GMP (₹)", numeric: true, cell: (row) => formatInr(row.amountRupees) },
    {
      id: "percent",
      header: "GMP %",
      numeric: true,
      cell: (row) => (row.percent === null ? "Unavailable" : formatSignedPercent(row.percent)),
    },
    {
      id: "mark",
      header: "Mark",
      cell: (row) => {
        const mark = [row.high ? "High" : null, row.low ? "Low" : null].filter(Boolean).join(", ");
        return mark || <span className="text-muted">None</span>;
      },
    },
  ];
  return <Table caption="GMP history readings" columns={columns} rows={points} getRowKey={(row) => `${row.at}-${row.amountRupees}`} />;
}

function ExtremeLine({ window }: { window?: GmpHistoryWindow | null }) {
  return (
    <p className="text-sm text-foreground">
      <span className="text-positive-text">{extremeText("High", window?.high ?? null)}</span>
      <span className="text-muted"> · </span>
      <span className="text-negative-text">{extremeText("Low", window?.low ?? null)}</span>
    </p>
  );
}

function extremeText(label: string, extreme: GmpHistoryWindow["high"] | null): string {
  if (!extreme) return `${label} unavailable`;
  return `${label} ${formatInr(extreme.amountRupees)} on ${formatIstDate(extreme.observedOn)}`;
}

function Provenance({ sourceName, updatedLabel }: { sourceName?: string | null; updatedLabel?: string | null }) {
  if (!sourceName && !updatedLabel) return null;
  return (
    <p className="text-sm text-muted">
      {sourceName ? `Source: ${sourceName}. ` : "Source unavailable. "}
      {updatedLabel ? `History retrieved ${updatedLabel}.` : "History time unavailable."}
    </p>
  );
}
