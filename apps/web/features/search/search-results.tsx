import { ActionLink } from "@/components/layout/action-link";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { searchIpos } from "@/features/ipos/catalog";
import { IpoList } from "@/features/ipos/ipo-list";
import type { Ipo } from "@ipo-singh/contracts";
import { SearchBox } from "./search-box";
import { SearchFilters } from "./search-filters";
import {
  parseSearchFilters,
  searchBoxKey,
  searchCatalogQuery,
  searchPath,
  searchRequestKey,
  type SearchFilters as SearchFilterValues,
  type SearchParamInput,
} from "./query";

export async function SearchResults({ searchParams }: { searchParams: Promise<SearchParamInput> }) {
  const filters = parseSearchFilters(await searchParams);
  const request = searchCatalogQuery(filters);
  const loaded = request ? await searchIpos(searchRequestKey(request)) : null;
  const ready = loaded?.status === "ready" ? loaded : null;
  return (
    <SearchBody
      filters={filters}
      items={ready ? ready.ipos : []}
      unavailable={loaded?.status === "unavailable"}
      invalid={loaded?.status === "invalid"}
      nextCursor={ready?.nextCursor ?? null}
      totalCount={ready?.totalCount ?? null}
    />
  );
}

export function SearchBody({
  filters,
  items = [],
  pending = false,
  unavailable = false,
  invalid = false,
  nextCursor = null,
  totalCount = null,
}: {
  filters: SearchFilterValues;
  items?: readonly Ipo[];
  pending?: boolean;
  unavailable?: boolean;
  invalid?: boolean;
  nextCursor?: string | null;
  totalCount?: number | null;
}) {
  return (
    <div className="grid gap-6">
      <SearchBox
        id="search-page"
        className="max-w-xl"
        initialQuery={filters.queryText}
        label="Company name or symbol"
        labelVisibility="visible"
        showSubmit
        suggestionsEnabled={filters.rejected === "none"}
        board={filters.board}
        status={filters.status}
        from={filters.from ?? ""}
        to={filters.to ?? ""}
      />
      <SearchFilters key={searchBoxKey(filters)} filters={filters} />
      {filters.cursorIgnored && filters.rejected === "none" ? (
        <p className="text-sm text-muted">That results page is not valid, so this is the first page.</p>
      ) : null}
      <SearchOutcome
        filters={filters}
        items={items}
        pending={pending}
        unavailable={unavailable}
        invalid={invalid}
        nextCursor={nextCursor}
        totalCount={totalCount}
      />
    </div>
  );
}

function SearchOutcome({
  filters,
  items,
  pending,
  unavailable,
  invalid,
  nextCursor,
  totalCount,
}: {
  filters: SearchFilterValues;
  items: readonly Ipo[];
  pending: boolean;
  unavailable: boolean;
  invalid: boolean;
  nextCursor: string | null;
  totalCount: number | null;
}) {
  if (pending) return <LoadingState label="Loading search" />;
  if (filters.rejected === "text") {
    return (
      <EmptyState
        title="That search text is not allowed"
        description="Angle brackets and control characters are not sent. No sample issues were substituted."
      />
    );
  }
  if (filters.rejected === "dates") {
    return (
      <EmptyState
        title="That date range is not valid"
        description="Use calendar dates, and keep the start on or before the end. This range was not sent to IPO Singh."
      />
    );
  }
  if (filters.rejected === "filters") {
    return (
      <EmptyState
        title="That filter is not recognized"
        description="Board must be Mainboard or SME. Status must be a stored IPO status. The search was not sent."
      />
    );
  }
  if (unavailable) {
    return (
      <ErrorState
        title="Search could not be loaded"
        message="The IPO Singh catalogue could not be read. No sample issues were substituted."
      />
    );
  }
  if (invalid) {
    return (
      <EmptyState
        title={filters.cursor ? "That results page is not valid" : "This search is not valid"}
        description="Check the text, dates, and filters. No sample issues were substituted."
        action={
          filters.cursor ? (
            <ActionLink href={searchPath({ ...filters, cursor: null })} variant="secondary">
              First page
            </ActionLink>
          ) : undefined
        }
      />
    );
  }
  if (filters.q.length > 0 && filters.q.length < 2) {
    return (
      <EmptyState
        title="Enter at least 2 characters"
        description="Search is sent to IPO Singh after 2 characters. A shorter query is not sent and does not invent matches."
      />
    );
  }
  if (!filters.q) {
    return (
      <EmptyState
        title="Enter an issue name"
        description="Search looks through stored Mainboard and SME issues by company name, symbol, or partial name. A query of at least 2 characters is sent to IPO Singh and will not invent matching issues."
      />
    );
  }
  const summary = resultSummary(items.length, totalCount, filters.cursor, filters.q);
  return (
    <section aria-labelledby="search-results-heading" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="search-results-heading" className="text-lg font-semibold">
          Results
        </h2>
        <p aria-live="polite" className="text-sm text-muted">
          {summary}
        </p>
      </div>
      <IpoList
        items={items}
        caption="Search results"
        emptyTitle={filters.cursor ? "No further stored issues are on this page" : `No stored IPO matches “${filters.q}”`}
        emptyDescription="Search checks stored company names, partial names, and symbols. It does not invent a match, and an empty result is not a price of zero."
      />
      {totalCount === null && items.length > 0 ? (
        <p className="text-sm text-muted">The stored catalogue did not report a complete count.</p>
      ) : null}
      {nextCursor || filters.cursor ? (
        <div className="flex flex-wrap gap-3">
          {filters.cursor ? (
            <ActionLink href={searchPath({ ...filters, cursor: null })} variant="secondary">
              First page
            </ActionLink>
          ) : null}
          {nextCursor ? (
            <ActionLink href={searchPath({ ...filters, cursor: nextCursor })} variant="secondary">
              Next results
            </ActionLink>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function resultSummary(count: number, totalCount: number | null, cursor: string | null, query: string): string {
  if (count === 0) {
    return cursor ? "No further stored issues are on this page." : `No stored IPO matches “${query}”.`;
  }
  if (totalCount === null) {
    return count === 1 ? "1 stored issue on this page." : `${count} stored issues on this page.`;
  }
  return `${count} of ${totalCount} stored issues.`;
}
