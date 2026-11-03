import { cn } from "@/lib/cn";
import { formatIstDateTime, freshnessLabel, resolveFreshness, type Freshness } from "@ipo-singh/core";

type DataFreshnessBadgeProps = {
  updatedAt: Date | null | undefined;
  now: Date;
  staleAfterMs?: number;
};

const toneClass: Record<Freshness, string> = {
  fresh: "text-positive-text",
  stale: "text-warning-text",
  missing: "text-muted",
};

export function DataFreshnessBadge({ updatedAt, now, staleAfterMs }: DataFreshnessBadgeProps) {
  const freshness = resolveFreshness(updatedAt, now, staleAfterMs);
  const label = freshnessLabel(freshness);
  const when = freshness === "missing" ? null : formatIstDateTime(updatedAt);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className={cn("font-medium", toneClass[freshness])}>{label}</span>
      {when ? <span className="text-muted">{when}</span> : null}
    </span>
  );
}
