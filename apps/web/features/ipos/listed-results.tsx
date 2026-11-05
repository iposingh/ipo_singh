import Link from "next/link";
import type { Ipo, IpoSummary } from "@ipo-singh/contracts";
import { freshnessLabel, isPresentNumber } from "@ipo-singh/core";
import { InrPrice } from "@/components/financial/inr-price";
import { LastUpdated } from "@/components/financial/ist-date-time";
import { MissingValue } from "@/components/financial/missing-value";
import { SignedChange } from "@/components/financial/signed-change";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, type TableColumn } from "@/components/ui/table";
import { IpoGuruCreditLink } from "@/features/ipo-details/source-credit-link";
import { isIpoGuruSource } from "@/features/ipo-details/source-credit";
import { BoardBadge, IndiaDate } from "@/features/ipos/ipo-facts";
import { WatchlistButton } from "@/features/watchlist/watchlist-button";
import { actualListingPerformance } from "@/features/ipos/listed";

type ListedRow = Ipo | IpoSummary;

function listingDateOf(ipo: ListedRow): string | null {
  if ("dates" in ipo) return ipo.dates.listingDate;
  return ipo.listingDate ?? null;
}

function updatedAt(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function IssuePrice({ ipo }: { ipo: ListedRow }) {
  const price = actualListingPerformance(ipo).issuePriceRupees;
  return isPresentNumber(price) ? <InrPrice value={price} /> : <MissingValue label="Issue price unavailable" />;
}

function ListingPrice({ ipo }: { ipo: ListedRow }) {
  const price = actualListingPerformance(ipo).listingPriceRupees;
  return isPresentNumber(price) ? <InrPrice value={price} /> : <MissingValue label="Listing price unavailable" />;
}

function ListingGain({ ipo }: { ipo: ListedRow }) {
  const gain = actualListingPerformance(ipo).gainPercent;
  return gain !== null ? <SignedChange percent={gain} /> : <MissingValue label="Listing gain unavailable" />;
}

function CurrentPrice({ ipo }: { ipo: ListedRow }) {
  const price = actualListingPerformance(ipo).currentPriceRupees;
  return isPresentNumber(price) ? <InrPrice value={price} /> : <MissingValue label="Current price unavailable" />;
}

function SinceListing({ ipo }: { ipo: ListedRow }) {
  const gain = actualListingPerformance(ipo).sinceListingPercent;
  return gain !== null ? <SignedChange percent={gain} /> : <MissingValue label="Change since listing unavailable" />;
}

function SourceFacts({ ipo }: { ipo: ListedRow }) {
  return (
    <div className="grid gap-1 text-sm">
      <span>{ipo.provenance.sourceName}</span>
      <span className="text-muted">{freshnessLabel(ipo.provenance.freshness)}</span>
      <LastUpdated value={updatedAt(ipo.provenance.retrievedAt)} />
    </div>
  );
}

const columns: readonly TableColumn<ListedRow>[] = [
  {
    id: "company",
    header: "Company",
    cell: (ipo) => (
      <Link href={`/ipos/${ipo.slug}`} className="font-medium underline-offset-2 hover:underline">
        {ipo.companyName}
      </Link>
    ),
  },
  { id: "board", header: "Category", cell: (ipo) => <BoardBadge board={ipo.board} /> },
  { id: "issue", header: "Issue price", numeric: true, cell: (ipo) => <IssuePrice ipo={ipo} /> },
  { id: "listing-price", header: "Listing price", numeric: true, cell: (ipo) => <ListingPrice ipo={ipo} /> },
  { id: "listing-date", header: "Listing date", cell: (ipo) => <IndiaDate value={listingDateOf(ipo)} /> },
  { id: "gain", header: "Listing gain", numeric: true, cell: (ipo) => <ListingGain ipo={ipo} /> },
  { id: "current", header: "Current price", numeric: true, cell: (ipo) => <CurrentPrice ipo={ipo} /> },
  { id: "since", header: "Since listing", numeric: true, cell: (ipo) => <SinceListing ipo={ipo} /> },
  { id: "source", header: "Source", cell: (ipo) => <SourceFacts ipo={ipo} /> },
  { id: "watchlist", header: "Watchlist", cell: (ipo) => <WatchlistButton ipoId={ipo.id} companyName={ipo.companyName} /> },
];

export function ListedResults({
  items,
  emptyTitle,
  emptyDescription,
}: {
  items: readonly ListedRow[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (items.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  const credit = items.some((ipo) => isIpoGuruSource(ipo.provenance.sourceName));
  return (
    <div className="grid gap-4">
      {credit ? (
        <p className="text-sm text-muted">
          <IpoGuruCreditLink />
        </p>
      ) : null}
      <ul className="grid gap-4 md:hidden">
        {items.map((ipo) => (
          <li key={ipo.id}>
            <Card className="grid gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Link href={`/ipos/${ipo.slug}`} className="text-lg font-semibold underline-offset-2 hover:underline">
                  {ipo.companyName}
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <BoardBadge board={ipo.board} />
                  <WatchlistButton ipoId={ipo.id} companyName={ipo.companyName} />
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted">Issue price</dt>
                  <dd><IssuePrice ipo={ipo} /></dd>
                </div>
                <div>
                  <dt className="text-muted">Listing price</dt>
                  <dd><ListingPrice ipo={ipo} /></dd>
                </div>
                <div>
                  <dt className="text-muted">Listing date</dt>
                  <dd><IndiaDate value={listingDateOf(ipo)} /></dd>
                </div>
                <div>
                  <dt className="text-muted">Listing gain</dt>
                  <dd><ListingGain ipo={ipo} /></dd>
                </div>
                <div>
                  <dt className="text-muted">Current price</dt>
                  <dd><CurrentPrice ipo={ipo} /></dd>
                </div>
                <div>
                  <dt className="text-muted">Since listing</dt>
                  <dd><SinceListing ipo={ipo} /></dd>
                </div>
              </dl>
              <SourceFacts ipo={ipo} />
            </Card>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table caption="Listed IPOs" columns={columns} rows={items} getRowKey={(ipo) => ipo.id} />
      </div>
    </div>
  );
}
