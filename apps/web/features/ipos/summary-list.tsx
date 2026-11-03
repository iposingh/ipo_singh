import type { IpoSummary } from "@ipo-singh/contracts";
import { ipoCardStage, unofficialGmpDisclaimer } from "@ipo-singh/core";
import { EmptyState } from "@/components/ui/empty-state";
import { formatSourceStamp, gmpDelay, sharedStamp } from "@/features/ipos/freshness-display";
import { IpoDashboardCard } from "@/features/ipos/ipo-dashboard-card";

export function SummaryList({
  items,
  emptyTitle,
  emptyDescription,
  today,
  now,
  variant = "active",
  showBoard,
}: {
  items: readonly IpoSummary[];
  emptyTitle: string;
  emptyDescription: string;
  today: string;
  now: string;
  variant?: "active" | "listed";
  showBoard?: boolean;
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  const boards = new Set(items.map((ipo) => ipo.board));
  const mixedBoard = showBoard ?? boards.size > 1;
  const stages = items.map((ipo) =>
    ipoCardStage({
      status: ipo.status,
      closeDate: ipo.closeDate,
      today,
      allotmentConfirmed: ipo.allotmentConfirmed,
      openDate: ipo.openDate,
      allotmentDate: ipo.allotmentDate ?? null,
      listingDate: ipo.listingDate ?? null,
    }),
  );
  const showOpenStage = stages.some(
    (stage) => stage === "last-day" || stage === "allotment-awaited" || stage === "allotment-out",
  );
  const gmpStamp = variant === "listed" ? null : sharedStamp(items.map((ipo) => ipo.gmpObservedAt));
  const subscriptionStamp = variant === "listed" ? null : sharedStamp(items.map((ipo) => ipo.subscriptionObservedAt));
  const showTimes = gmpStamp === "mixed" || subscriptionStamp === "mixed";
  const gmpText = typeof gmpStamp === "string" ? formatSourceStamp(gmpStamp) : null;
  const subscriptionText = typeof subscriptionStamp === "string" ? formatSourceStamp(subscriptionStamp) : null;
  const nowDate = new Date(now);
  const anyDelayed = variant !== "listed" && !Number.isNaN(nowDate.getTime()) && items.some((ipo) => gmpDelay(ipo, nowDate) === "delayed");
  return (
    <div className="grid gap-3">
      {variant === "listed" ? null : (
        <div className="grid gap-1">
          <p className="text-xs text-muted">
            {gmpText ? `GMP* updated ${gmpText}` : "GMP* update time unavailable"}
            {anyDelayed && gmpText && !showTimes ? ". These readings are delayed and are not live quotes." : ""}
            {subscriptionText && subscriptionText !== gmpText ? ` Subscription updated ${subscriptionText}.` : ""}
          </p>
          <p className="text-xs leading-5 text-muted">{unofficialGmpDisclaimer}</p>
        </div>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((ipo) => (
          <li key={ipo.id}>
            <IpoDashboardCard
              ipo={ipo}
              today={today}
              now={now}
              showBoard={mixedBoard}
              showOpenStage={showOpenStage}
              variant={variant}
              showTimes={showTimes}
              markDelay={showTimes || !gmpText}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
