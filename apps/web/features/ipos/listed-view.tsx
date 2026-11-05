import Link from "next/link";
import type { Ipo, IpoSummary } from "@ipo-singh/contracts";
import { ActionLink } from "@/components/layout/action-link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IpoListSkeleton } from "@/features/ipos/ipo-list-skeleton";
import { listedPath, type ListedBoard, type ListedQuery, type ListedSort } from "@/features/ipos/listed";
import { ListedResults } from "@/features/ipos/listed-results";
import { paginateItems } from "@/features/ipos/listing-sections";

const boards: readonly { value: ListedBoard; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mainboard", label: "Mainboard" },
  { value: "sme", label: "SME" },
];

const sorts: readonly { value: ListedSort; label: string }[] = [
  { value: "listing", label: "Listing date" },
  { value: "gain", label: "Listing gain" },
  { value: "issue", label: "Issue price" },
  { value: "name", label: "Company name" },
];

function chipClass(current: boolean): string {
  return current
    ? "inline-flex h-10 items-center rounded-control bg-accent-subtle px-3 text-sm font-medium text-foreground shadow-card ring-1 ring-[color:var(--ds-border-subtle)]"
    : "inline-flex h-10 items-center rounded-control px-3 text-sm font-medium text-muted hover:bg-surface-muted hover:text-foreground";
}

export function ListedView({
  query,
  items,
  truncated = false,
  unavailable = false,
  pending = false,
}: {
  query: ListedQuery;
  items: readonly (Ipo | IpoSummary)[];
  truncated?: boolean;
  unavailable?: boolean;
  pending?: boolean;
}) {
  const paged = paginateItems(items, query.page);
  const outOfRange = items.length > 0 && paged.pageItems.length === 0;
  const emptyTitle = query.q ? `No stored listed IPO matches “${query.q}”` : "No listed IPOs are stored";
  return (
    <PageContainer className="grid gap-6">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Listed IPOs" }]} />
      <PageHeader
        title="Listed IPOs"
        description="Issue price, listing price, listing date, and the actual gain or loss from the issue price to the listing price. GMP is not shown as a listing gain. A current price appears only when the stored issue includes one."
      />
      <p className="text-sm text-muted">
        <Link href="/ipo-calendar" className="font-medium text-link underline-offset-2 hover:underline">
          IPO calendar
        </Link>
      </p>
      <ListedControls query={query} />
      {pending ? (
        <IpoListSkeleton label="Loading listed IPOs" />
      ) : unavailable ? (
        <ErrorState
          title="Listed IPOs could not be loaded"
          message="The IPO Singh catalogue could not be read. No sample issues were substituted."
          action={
            <ActionLink href={listedPath(query)} variant="secondary">
              Try again
            </ActionLink>
          }
        />
      ) : outOfRange ? (
        <EmptyState
          title="No issues on this page"
          description="This page is past the stored list. No extra issues were added."
          action={
            <ActionLink href={listedPath({ ...query, page: 1 })} variant="secondary">
              Back to the first page
            </ActionLink>
          }
        />
      ) : (
        <div className="grid gap-4">
          <ListedResults
            items={paged.pageItems}
            emptyTitle={emptyTitle}
            emptyDescription="The list shows issues stored by IPO Singh with status listed. An empty list is not a listing gain of zero."
          />
          <ListedPager query={query} pageCount={paged.pageCount} />
          {truncated ? <p className="text-sm text-muted">More listed issues were not loaded.</p> : null}
        </div>
      )}
    </PageContainer>
  );
}

function ListedControls({ query }: { query: ListedQuery }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2" role="navigation" aria-label="Board">
        {boards.map((board) => (
          <Link
            key={board.value}
            href={listedPath({ ...query, board: board.value, page: 1 })}
            aria-current={query.board === board.value ? "page" : undefined}
            className={chipClass(query.board === board.value)}
          >
            {board.label}
          </Link>
        ))}
      </div>
      <form key={`${query.q}:${query.sort}:${query.direction}:${query.board}`} action="/ipos/listed" method="get" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_10rem_auto] sm:items-end">
        {query.board !== "all" ? <input type="hidden" name="board" value={query.board} /> : null}
        <div className="grid gap-1.5">
          <label htmlFor="listed-search" className="text-sm font-medium">
            Company name
          </label>
          <input
            id="listed-search"
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder="Company name"
            autoComplete="off"
            className="h-11 w-full rounded-control border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="listed-sort" className="text-sm font-medium">
            Sort
          </label>
          <select id="listed-sort" name="sort" defaultValue={query.sort} className="h-11 rounded-control border border-border bg-surface px-3 text-base text-foreground">
            {sorts.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="listed-direction" className="text-sm font-medium">
            Order
          </label>
          <select id="listed-direction" name="direction" defaultValue={query.direction} className="h-11 rounded-control border border-border bg-surface px-3 text-base text-foreground">
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        <button type="submit" className="inline-flex h-11 items-center justify-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground">
          Apply
        </button>
      </form>
    </div>
  );
}

function ListedPager({ query, pageCount }: { query: ListedQuery; pageCount: number }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-3">
      {query.page > 1 ? (
        <ActionLink href={listedPath({ ...query, page: query.page - 1 })} variant="secondary">
          Previous
        </ActionLink>
      ) : (
        <span className="inline-flex h-11 items-center px-4 text-sm text-muted">Previous</span>
      )}
      <p className="text-sm text-muted">
        Page {query.page} of {pageCount}
      </p>
      {query.page < pageCount ? (
        <ActionLink href={listedPath({ ...query, page: query.page + 1 })} variant="secondary">
          Next
        </ActionLink>
      ) : (
        <span className="inline-flex h-11 items-center px-4 text-sm text-muted">Next</span>
      )}
    </nav>
  );
}
