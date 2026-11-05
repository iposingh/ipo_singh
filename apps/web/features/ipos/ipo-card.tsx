import Link from "next/link";
import type { ReactNode } from "react";
import type { Ipo } from "@ipo-singh/contracts";
import { LastUpdated } from "@/components/financial/ist-date-time";
import { PriceBand } from "@/components/financial/price-band";
import { Card } from "@/components/ui/card";
import { CompactGmp } from "@/features/ipos/compact-gmp";
import { BoardBadge, IndiaDate, LotSize, MinimumInvestment, StatusBadge } from "@/features/ipos/ipo-facts";
import { providerObservedAt } from "@/features/ipos/updated-at";
import { WatchlistButton } from "@/features/watchlist/watchlist-button";

export function IpoCard({ ipo }: { ipo: Ipo }) {
  const updatedAt = providerObservedAt(ipo);
  return (
    <Card className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-tight">
          <Link href={`/ipos/${ipo.slug}`} prefetch={false} className="underline-offset-2 hover:underline">
            {ipo.companyName}
          </Link>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <BoardBadge board={ipo.board} />
          <StatusBadge status={ipo.status} allotmentConfirmed={ipo.allotmentConfirmed} />
          <WatchlistButton ipoId={ipo.id} companyName={ipo.companyName} />
        </div>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Fact label="Opens" value={<IndiaDate value={ipo.dates.openDate} />} />
        <Fact label="Closes" value={<IndiaDate value={ipo.dates.closeDate} />} />
        <Fact label="Price band" value={<PriceBand lowRupees={ipo.offer.priceBand.lowRupees} highRupees={ipo.offer.priceBand.highRupees} />} />
        <Fact label="Lot size" value={<LotSize shares={ipo.offer.lotSizeShares} />} />
        <Fact label="Minimum investment" value={<MinimumInvestment offer={ipo.offer} />} />
        <Fact label="Listing" value={<IndiaDate value={ipo.dates.listingDate} />} />
        <Fact label="GMP*" value={<CompactGmp ipo={ipo} />} />
      </dl>
      <LastUpdated value={updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null} />
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
