"use client";

import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { type GmpChartPoint } from "@/features/ipo-details/gmp-chart";
import { ChartFrame, ObservationChart } from "@/features/ipo-details/observation-chart";

const subscriptionNote = "Times subscribed. A missing day is not connected and is not drawn as 0x. A published zero stays 0x.";

export function SubscriptionHistoryChart({
  title,
  points,
  maxGapMs,
  emptyDescription,
  status = "ready",
  sourceName = null,
  updatedLabel = null,
}: {
  title: string;
  points: readonly GmpChartPoint[];
  maxGapMs: number;
  emptyDescription: string;
  status?: "ready" | "unavailable" | "loading";
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
    return (
      <ErrorState title={`${title} could not be loaded`} message="IPO Singh could not read this subscription history. No sample multiples were added." />
    );
  }
  if (points.length === 0) {
    return (
      <figure className="rounded-panel border border-dashed border-border bg-surface px-5 py-8">
        <figcaption className="text-sm font-semibold text-foreground">{title}</figcaption>
        <p className="mt-2 text-sm leading-6 text-muted">{emptyDescription}</p>
        <Provenance sourceName={sourceName} updatedLabel={updatedLabel} />
      </figure>
    );
  }
  return (
    <ChartFrame title={title} note={subscriptionNote}>
      <ObservationChart points={points} maxGapMs={maxGapMs} kind="times" label={title} />
      <p className="text-sm text-muted">Tap a point for its multiple and IST time. The history table lists every stored day.</p>
      <Provenance sourceName={sourceName} updatedLabel={updatedLabel} />
    </ChartFrame>
  );
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
