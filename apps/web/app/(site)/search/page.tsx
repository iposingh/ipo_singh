import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/ui/loading-state";
import type { SearchParamInput } from "@/features/search/query";
import { SearchResults } from "@/features/search/search-results";

import { pageMetadata } from "@/lib/seo/metadata";

const description =
  "Search stored Mainboard and SME IPO issues by company name, symbol, or partial name. Filter by status and stored open, close, or listing dates.";

export const metadata: Metadata = pageMetadata({
  title: "Search",
  description,
  path: "/search",
  index: false,
});

export default function SearchPage({ searchParams }: { searchParams: Promise<SearchParamInput> }) {
  return (
    <PageContainer className="grid gap-6">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Search" }]} />
      <PageHeader
        title="Search"
        description="Search looks through stored Mainboard and SME issues by company name, symbol, or partial name. Status and date filters use the same stored catalogue. An issue that has not been stored is not returned."
      />
      <Suspense fallback={<LoadingState label="Loading search" />}>
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}
