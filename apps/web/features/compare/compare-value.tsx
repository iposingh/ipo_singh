import Link from "next/link";
import { formatSubscriptionMultiple, freshnessLabel, isPresentNumber } from "@ipo-singh/core";
import { InrPrice } from "@/components/financial/inr-price";
import { PriceBand } from "@/components/financial/price-band";
import { SignedChange } from "@/components/financial/signed-change";
import { MissingValue } from "@/components/financial/missing-value";
import { BoardBadge, IndiaDate, LotSize, StatusBadge } from "@/features/ipos/ipo-facts";
import type { CompareDisplay } from "@/features/compare/rows";

export function CompareValue({ display }: { display: CompareDisplay }) {
  switch (display.type) {
    case "link":
      return (
        <Link href={`/ipos/${display.slug}`} className="font-medium underline-offset-2 hover:underline">
          {display.name}
        </Link>
      );
    case "missing-name":
      return <span className="text-muted">Not stored</span>;
    case "board":
      return <BoardBadge board={display.board} />;
    case "status":
      return <StatusBadge status={display.status} />;
    case "band":
      return <PriceBand lowRupees={display.lowRupees} highRupees={display.highRupees} />;
    case "shares":
      return <LotSize shares={display.shares} />;
    case "inr":
      return isPresentNumber(display.rupees) ? <InrPrice value={display.rupees} /> : <MissingValue label={display.missingLabel} />;
    case "date":
      return <IndiaDate value={display.iso} />;
    case "gmp":
      if (!isPresentNumber(display.amountRupees)) return <MissingValue label="GMP unavailable" />;
      return (
        <span>
          <InrPrice value={display.amountRupees} />
          {display.percent === null ? <span className="text-muted"> · Percent unavailable</span> : <span> · <SignedChange percent={display.percent} /></span>}
          {display.freshness && display.freshness !== "missing" ? <span className="text-muted"> · {freshnessLabel(display.freshness)}</span> : null}
        </span>
      );
    case "times":
      return isPresentNumber(display.times) ? (
        <span className="tabular-nums">{formatSubscriptionMultiple(display.times)}</span>
      ) : (
        <MissingValue label="Subscription unavailable" />
      );
    case "gain":
      return display.percent !== null ? <SignedChange percent={display.percent} /> : <MissingValue label="Listing gain unavailable" />;
    case "text":
      return <span className={display.missing ? "text-muted" : undefined}>{display.text}</span>;
    default: {
      const unreachable: never = display;
      return unreachable;
    }
  }
}
