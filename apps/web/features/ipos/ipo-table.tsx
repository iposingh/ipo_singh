import Link from "next/link";
import type { Ipo } from "@ipo-singh/contracts";
import { LastUpdated } from "@/components/financial/ist-date-time";
import { PriceBand } from "@/components/financial/price-band";
import { Table, type TableColumn } from "@/components/ui/table";
import { CompactGmp } from "@/features/ipos/compact-gmp";
import { BoardBadge, IndiaDate, LotSize, MinimumInvestment, StatusBadge } from "@/features/ipos/ipo-facts";
import { providerObservedAt } from "@/features/ipos/updated-at";
import { WatchlistButton } from "@/features/watchlist/watchlist-button";

const columns: readonly TableColumn<Ipo>[] = [
  {
    id: "company",
    header: "Company",
    cell: (ipo) => (
      <Link href={`/ipos/${ipo.slug}`} prefetch={false} className="font-medium underline-offset-2 hover:underline">
        {ipo.companyName}
      </Link>
    ),
  },
  { id: "board", header: "Category", cell: (ipo) => <BoardBadge board={ipo.board} /> },
  { id: "status", header: "Status", cell: (ipo) => <StatusBadge status={ipo.status} allotmentConfirmed={ipo.allotmentConfirmed} /> },
  { id: "open", header: "Opens", cell: (ipo) => <IndiaDate value={ipo.dates.openDate} /> },
  { id: "close", header: "Closes", cell: (ipo) => <IndiaDate value={ipo.dates.closeDate} /> },
  {
    id: "band",
    header: "Price band",
    numeric: true,
    cell: (ipo) => <PriceBand lowRupees={ipo.offer.priceBand.lowRupees} highRupees={ipo.offer.priceBand.highRupees} />,
  },
  { id: "lot", header: "Lot size", numeric: true, cell: (ipo) => <LotSize shares={ipo.offer.lotSizeShares} /> },
  {
    id: "minimum",
    header: "Minimum investment",
    numeric: true,
    cell: (ipo) => <MinimumInvestment offer={ipo.offer} />,
  },
  { id: "listing", header: "Listing", cell: (ipo) => <IndiaDate value={ipo.dates.listingDate} /> },
  { id: "gmp", header: "GMP*", numeric: true, cell: (ipo) => <CompactGmp ipo={ipo} /> },
  {
    id: "watchlist",
    header: "Watchlist",
    cell: (ipo) => <WatchlistButton ipoId={ipo.id} companyName={ipo.companyName} />,
  },
  {
    id: "updated",
    header: "Updated",
    cell: (ipo) => {
      const updatedAt = providerObservedAt(ipo);
      return <LastUpdated value={updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null} />;
    },
  },
];

export function IpoTable({ items, caption = "IPO issues" }: { items: readonly Ipo[]; caption?: string }) {
  return (
    <Table
      caption={caption}
      columns={columns}
      rows={items}
      getRowKey={(ipo) => ipo.id}
      emptyLabel="No IPO issues are stored."
    />
  );
}
