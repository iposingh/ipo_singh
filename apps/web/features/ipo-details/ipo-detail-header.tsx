import Link from "next/link";
import type { ReactNode } from "react";
import type { Ipo } from "@ipo-singh/contracts";
import { JsonLd } from "@/components/seo/json-ld";
import { IstDateTime } from "@/components/financial/ist-date-time";
import { PriceBand } from "@/components/financial/price-band";
import { ActionLink } from "@/components/layout/action-link";
import { BoardBadge, IndiaDate, LotSize, MinimumInvestment, StatusBadge } from "@/features/ipos/ipo-facts";
import { boardBrowseTitle, boardLabel, listingLifecycleLabel } from "@/features/ipos/labels";
import { WatchlistButton } from "@/features/watchlist/watchlist-button";
import { siteUrl } from "@/lib/seo/site";
import { ipoPageDocument } from "@/lib/seo/structured-data";

export function IpoDetailHeader({ ipo }: { ipo: Ipo | null }) {
  if (!ipo) {
    return (
      <header className="grid gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-link uppercase">IPO</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">This IPO is not loaded</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
            No issue is stored at this address. The sections below stay empty rather than showing a sample company.
          </p>
        </div>
        <ActionLink href="/ipos/mainboard" variant="secondary">
          {boardBrowseTitle("mainboard")}
        </ActionLink>
      </header>
    );
  }

  const retrievedAt = ipo.provenance.retrievedAt ? new Date(ipo.provenance.retrievedAt) : null;
  const updated = retrievedAt && !Number.isNaN(retrievedAt.getTime()) ? retrievedAt : null;
  const origin = siteUrl();

  return (
    <header className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <BoardBadge board={ipo.board} />
        <StatusBadge status={ipo.status} allotmentConfirmed={ipo.allotmentConfirmed} />
      </div>
      <div>
        <p className="text-xs font-semibold tracking-[0.08em] text-link uppercase">{boardLabel(ipo.board)}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{ipo.companyName}</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
          {boardLabel(ipo.board)} issue.{" "}
          {listingLifecycleLabel({ status: ipo.status, allotmentConfirmed: ipo.allotmentConfirmed })}.
        </p>
        <div className="mt-4">
          <WatchlistButton ipoId={ipo.id} companyName={ipo.companyName} />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <HeaderFact label="Price band">
          <PriceBand lowRupees={ipo.offer.priceBand.lowRupees} highRupees={ipo.offer.priceBand.highRupees} />
        </HeaderFact>
        <HeaderFact label="Lot size">
          <LotSize shares={ipo.offer.lotSizeShares} />
        </HeaderFact>
        <HeaderFact label="Minimum investment">
          <MinimumInvestment offer={ipo.offer} />
        </HeaderFact>
        <HeaderFact label="Opens">
          <IndiaDate value={ipo.dates.openDate} />
        </HeaderFact>
        <HeaderFact label="Closes">
          <IndiaDate value={ipo.dates.closeDate} />
        </HeaderFact>
        <HeaderFact label="Last updated">
          <IstDateTime value={updated} />
        </HeaderFact>
      </dl>
      <p className="text-sm text-foreground">Source: {ipo.provenance.sourceName}</p>
      <nav aria-label="Related IPO pages">
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          <li>
            <Link href="/ipo-calendar" className="inline-flex min-h-11 items-center text-sm text-link underline">
              IPO Calendar
            </Link>
          </li>
          <li>
            <Link href="/ipos/listed" className="inline-flex min-h-11 items-center text-sm text-link underline">
              Listed IPOs
            </Link>
          </li>
          <li>
            <Link href={`/compare?ipo=${encodeURIComponent(ipo.slug)}`} className="inline-flex min-h-11 items-center text-sm text-link underline">
              Compare this IPO
            </Link>
          </li>
        </ul>
      </nav>
      <JsonLd data={origin ? ipoPageDocument(origin, ipo) : null} />
    </header>
  );
}

function HeaderFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}
