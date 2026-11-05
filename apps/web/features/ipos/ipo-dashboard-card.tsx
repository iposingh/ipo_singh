import Link from "next/link";
import type { ReactNode } from "react";
import type { IpoSummary } from "@ipo-singh/contracts";
import {
  formatInr,
  formatInrScale,
  formatIstDate,
  formatPriceBand,
  formatSignedPercent,
  formatSubscriptionMultiple,
  gmpStarLabel,
  ipoCardStage,
  isPresentNumber,
  type CardStage,
} from "@ipo-singh/core";
import { ActionLink } from "@/components/layout/action-link";
import { Badge } from "@/components/ui/badge";
import { SubscriptionMultiple } from "@/components/financial/subscription-multiple";
import { allotmentLink } from "@/features/allotment/link";
import { summarizeGmp } from "@/features/ipos/gmp-summary";
import { listingReturn } from "@/features/ipos/listing-return";
import { formatSourceStamp, gmpDelay } from "@/features/ipos/freshness-display";
import { BoardBadge, IndiaDate } from "@/features/ipos/ipo-facts";
import { WatchlistButton } from "@/features/watchlist/watchlist-button";

export function IpoDashboardCard({
  ipo,
  today,
  now,
  showBoard,
  showOpenStage,
  variant,
  showTimes,
  markDelay,
}: {
  ipo: IpoSummary;
  today: string;
  now: string;
  showBoard: boolean;
  showOpenStage: boolean;
  variant: "active" | "listed";
  showTimes: boolean;
  markDelay: boolean;
}) {
  const stage = ipoCardStage({
    status: ipo.status,
    closeDate: ipo.closeDate,
    today,
    allotmentConfirmed: ipo.allotmentConfirmed,
    openDate: ipo.openDate,
    allotmentDate: ipo.allotmentDate ?? null,
    listingDate: ipo.listingDate ?? null,
  });
  const listed = variant === "listed" || stage === "listed";
  const performance = listingReturn(ipo);
  const stamp = now ? new Date(now) : null;
  const delay = stamp && !Number.isNaN(stamp.getTime()) ? gmpDelay(ipo, stamp) : "unknown";
  const allotment =
    stage === "allotment-out" || stage === "allotment-awaited"
      ? allotmentLink(ipo.allotmentUrl, { confirmed: stage === "allotment-out", registrarName: ipo.registrarName })
      : null;
  return (
    <article className="grid gap-3 rounded-panel border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {showBoard ? <BoardBadge board={ipo.board} /> : null}
            <StageMark stage={stage} showOpen={showOpenStage} listed={listed} />
          </div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            <Link href={`/ipos/${ipo.slug}`} prefetch={false} className="underline-offset-2 hover:underline">
              {ipo.companyName}
            </Link>
          </h3>
          <p className="text-sm text-muted">
            <IndiaDate value={ipo.openDate} />
            <span aria-hidden="true"> – </span>
            <IndiaDate value={ipo.closeDate} />
          </p>
        </div>
        <WatchlistButton ipoId={ipo.id} companyName={ipo.companyName} />
      </div>
      {listed ? <ListingFacts ipo={ipo} performance={performance} /> : <ActiveFacts ipo={ipo} delay={markDelay ? delay : "current"} showTimes={showTimes} />}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {allotment?.href ? (
          <a
            href={allotment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-control bg-primary-solid px-3 text-sm font-medium text-primary-foreground"
          >
            Check Allotment
          </a>
        ) : null}
        <ActionLink href={`/ipos/${ipo.slug}`} variant="secondary">
          View details
        </ActionLink>
      </div>
    </article>
  );
}

function StageMark({ stage, showOpen, listed }: { stage: CardStage | null; showOpen: boolean; listed: boolean }) {
  if (listed || !stage || stage === "listed" || stage === "upcoming") return null;
  if (stage === "open" && !showOpen) return null;
  if (stage === "last-day") return <Badge tone="warning">Last Day</Badge>;
  if (stage === "allotment-out") return <Badge tone="positive">Allotment Out</Badge>;
  if (stage === "allotment-awaited") return <Badge tone="warning">Allotment Awaited</Badge>;
  if (stage === "open") return <span className="text-xs font-medium text-muted">Open</span>;
  return null;
}

function ActiveFacts({
  ipo,
  delay,
  showTimes,
}: {
  ipo: IpoSummary;
  delay: "delayed" | "current" | "unknown";
  showTimes: boolean;
}) {
  const gmp = summarizeGmp({
    gmpAmountRupees: ipo.gmpAmountRupees,
    issuePriceRupees: ipo.issuePriceRupees,
    priceBandLowRupees: ipo.priceBandLowRupees,
    priceBandHighRupees: ipo.priceBandHighRupees,
  });
  const percent = isPresentNumber(ipo.gmpPercent) ? ipo.gmpPercent : gmp.available ? gmp.percent : null;
  const price = formatPriceBand(ipo.priceBandLowRupees, ipo.priceBandHighRupees);
  const issue = isPresentNumber(ipo.issuePriceRupees) ? formatInr(ipo.issuePriceRupees) : null;
  const gmpTime = formatSourceStamp(ipo.gmpObservedAt);
  const subscriptionTime = formatSourceStamp(ipo.subscriptionObservedAt);
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3">
      {price !== "Unavailable" ? <Fact label="Price band" value={price} /> : issue ? <Fact label="Issue price" value={issue} /> : <Fact label="Price band" value="Unavailable" />}
      <Fact label="Lot size" value={lotText(ipo.lotSizeShares)} />
      <Fact label="Issue size" value={isPresentNumber(ipo.issueSizeRupees) ? formatInrScale(ipo.issueSizeRupees) : "Unavailable"} />
      <Fact
        label={gmpStarLabel}
        value={
          <span className="grid gap-0.5">
            <span className="font-medium tabular-nums text-foreground">
              {gmp.available ? `${gmp.amountText}${percent !== null ? ` (${formatSignedPercent(percent)})` : ""}` : "GMP unavailable"}
            </span>
            {showTimes && gmp.available ? <ReadingTime time={gmpTime} delay={delay} /> : null}
            {gmp.available && delay === "delayed" ? <DelayedMark /> : null}
          </span>
        }
      />
      <Fact
        label="Subscription"
        value={
          <span className="grid gap-0.5">
            <SubscriptionMultiple value={ipo.subscriptionTotalTimes} />
            {showTimes && subscriptionTime && subscriptionTime !== gmpTime ? <span className="text-xs text-muted">Subscription {subscriptionTime}</span> : null}
          </span>
        }
      />
    </dl>
  );
}

function ListingFacts({
  ipo,
  performance,
}: {
  ipo: IpoSummary;
  performance: ReturnType<typeof listingReturn>;
}) {
  const tone = performance.gainPercent === null ? "text-muted" : performance.gainPercent > 0 ? "text-positive-text" : performance.gainPercent < 0 ? "text-negative-text" : "text-muted";
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3">
      <Fact label="Issue price" value={performance.issuePriceRupees === null ? "Unavailable" : formatInr(performance.issuePriceRupees)} />
      <Fact label="Listing price" value={performance.listingPriceRupees === null ? "Listing price unavailable" : formatInr(performance.listingPriceRupees)} />
      <Fact label="Listing date" value={ipo.listingDate ? formatIstDate(ipo.listingDate) : "Date unavailable"} />
      <Fact
        label="Listing gain/loss"
        value={
          performance.gainRupees === null || performance.gainPercent === null ? (
            <span className="text-muted">Unavailable</span>
          ) : (
            <span className={`font-medium tabular-nums ${tone}`}>
              {formatInr(performance.gainRupees)} ({formatSignedPercent(performance.gainPercent)})
            </span>
          )
        }
      />
      <Fact label="Subscription" value={formatSubscriptionMultiple(ipo.subscriptionTotalTimes)} />
    </dl>
  );
}

function ReadingTime({ time, delay }: { time: string | null; delay: "delayed" | "current" | "unknown" }) {
  if (!time) return <span className="text-xs text-muted">GMP* update time unavailable</span>;
  return <span className="text-xs text-muted">{delay === "delayed" ? `GMP* ${time}` : time}</span>;
}

function DelayedMark() {
  return (
    <span
      className="text-xs font-medium text-warning-text"
      title="This GMP reading is older than the usual refresh window. The stored value is shown and it is not a live quote."
    >
      <span className="sr-only">Delayed. </span>
      Delayed
      <span className="sr-only"> This GMP reading is older than the usual refresh window. The stored value is shown and it is not a live quote.</span>
    </span>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function lotText(shares: number | null | undefined): string {
  if (!isPresentNumber(shares)) return "Unavailable";
  return `${new Intl.NumberFormat("en-IN").format(shares)} shares`;
}
