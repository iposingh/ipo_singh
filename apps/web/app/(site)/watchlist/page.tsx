import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { WatchlistView } from "@/features/watchlist/watchlist-view";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Watchlist",
  description: "Saved IPO issues for a signed-in account. Current prices and GMP are read from the catalogue.",
  path: "/watchlist",
  index: false,
  follow: false,
});

export default function WatchlistPage() {
  return (
    <PageContainer className="grid max-w-3xl gap-6">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Watchlist" }]} />
      <PageHeader
        title="Watchlist"
        description="A saved row stores the IPO id, the date added, and an optional note. Current details are read from the catalogue."
      />
      <WatchlistView />
    </PageContainer>
  );
}
