import Link from "next/link";
import type { Board } from "@ipo-singh/contracts";
import { ActionLink } from "@/components/layout/action-link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { BoardListingSections } from "@/features/ipos/board-sections";
import type { IpoBrowseQuery } from "@/features/ipos/browse";
import { IpoListSkeleton } from "@/features/ipos/ipo-list-skeleton";
import { boardBrowseTitle, boardLabel } from "@/features/ipos/labels";
import { listingFailureCopy } from "@/features/ipos/listing-state";
import { isListingOverview, listingPageCount, listingPath, statusFilterPath, type ListingSectionPage } from "@/features/ipos/listing-sections";
import { SummaryList } from "@/features/ipos/summary-list";
import { isIpoGuruSource } from "@/features/ipo-details/source-credit";
import { latestRetrievedAt, SourceAttribution } from "@/features/ipo-details/source-attribution";
import type { ListingPageResult } from "@/lib/api/ipo-singh";

const statusOptions = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "upcoming", label: "Upcoming" },
  { value: "closed", label: "Closed" },
  { value: "allotment", label: "Allotment" },
  { value: "listed", label: "Listed" },
] as const;

type IpoBrowseViewProps = {
  board: Board;
  query: IpoBrowseQuery;
  page?: number;
  sections?: readonly ListingSectionPage[];
  list?: ListingPageResult | null;
  pending?: boolean;
  today: string;
  now: string;
};

export function IpoBrowseView({ board, query, page = 1, sections = [], list = null, pending = false, today, now }: IpoBrowseViewProps) {
  const title = boardBrowseTitle(board);
  const other = board === "mainboard" ? "sme" : "mainboard";
  const overview = isListingOverview(query);
  const outOfRange = !overview && list?.status === "ready" && (list.totalCount ?? 0) > 0 && list.items.length === 0;
  return (
    <PageContainer className="grid gap-6">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: title }]} />
      <PageHeader
        eyebrow={boardLabel(board)}
        title={title}
        description={board === "mainboard" ? "Mainboard issues. SME issues stay on their own page." : "SME issues, listed separately from Mainboard."}
      />
      <p className="text-sm text-muted">
        <Link href={`/ipos/${other}`} prefetch={false} className="font-medium text-link underline-offset-2 hover:underline">
          {boardBrowseTitle(other)}
        </Link>
      </p>
      <IpoBrowseControls board={board} query={query} />
      {pending ? (
        <IpoListSkeleton label={`Loading ${title}`} />
      ) : overview ? (
        <BoardListingSections board={board} sections={sections} today={today} now={now} />
      ) : list && list.status !== "ready" ? (
        <ErrorState
          title={listingFailureCopy(list.status, title).title}
          message={listingFailureCopy(list.status, title).message}
          action={
            <ActionLink href={listingPath(board, query, page)} variant="secondary">
              Try again
            </ActionLink>
          }
        />
      ) : outOfRange ? (
        <EmptyState
          title="No issues on this page"
          description="This page is past the stored list. No extra issues were added."
          action={
            <ActionLink href={listingPath(board, query, 1)} variant="secondary">
              Back to the first page
            </ActionLink>
          }
        />
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            {list?.totalCount === null ? "Stored issues" : `${list?.totalCount ?? 0} stored issues`}
            {query.q ? ` matching “${query.q}”` : ""}
          </p>
          <SummaryList
            items={list?.items ?? []}
            today={today}
            now={now}
            variant={query.status === "listed" ? "listed" : "active"}
            showBoard={false}
            emptyTitle={query.q ? `No ${boardLabel(board)} IPO matches “${query.q}”` : `No ${boardLabel(board)} IPOs match these filters`}
            emptyDescription=""
          />
          {(list?.items ?? []).some((ipo) => isIpoGuruSource(ipo.provenance.sourceName)) ? (
            <SourceAttribution retrievedAt={latestRetrievedAt((list?.items ?? []).map((ipo) => ipo.provenance.retrievedAt))} />
          ) : null}
          <ListingPager board={board} query={query} page={page} pageCount={listingPageCount(list?.totalCount ?? 0)} />
        </div>
      )}
    </PageContainer>
  );
}

function ListingPager({
  board,
  query,
  page,
  pageCount,
}: {
  board: Board;
  query: IpoBrowseQuery;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-3">
      {page > 1 ? (
        <ActionLink href={listingPath(board, query, page - 1)} variant="secondary">
          Previous
        </ActionLink>
      ) : (
        <span className="inline-flex h-11 items-center px-4 text-sm text-muted">Previous</span>
      )}
      <p className="text-sm text-muted">
        Page {page} of {pageCount}
      </p>
      {page < pageCount ? (
        <ActionLink href={listingPath(board, query, page + 1)} variant="secondary">
          Next
        </ActionLink>
      ) : (
        <span className="inline-flex h-11 items-center px-4 text-sm text-muted">Next</span>
      )}
    </nav>
  );
}

function IpoBrowseControls({ board, query }: { board: Board; query: IpoBrowseQuery }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2" role="navigation" aria-label="IPO status">
        {statusOptions.map((option) => {
          const current = query.status === option.value;
          return (
            <Link
              key={option.value}
              href={statusFilterPath(board, option.value, query.q)}
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? "inline-flex h-10 items-center rounded-control bg-surface px-3 text-sm font-medium text-foreground"
                  : "inline-flex h-10 items-center rounded-control px-3 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"
              }
            >
              {option.label}
            </Link>
          );
        })}
      </div>
      <form
        key={`${query.q}:${query.sort}:${query.direction}`}
        action={`/ipos/${board}`}
        method="get"
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_8rem_auto] sm:items-end"
      >
        {query.status !== "all" ? <input type="hidden" name="status" value={query.status} /> : null}
        <div className="grid gap-1.5">
          <label htmlFor={`${board}-search`} className="text-sm font-medium">
            Search this list
          </label>
          <input
            id={`${board}-search`}
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder="Company name"
            autoComplete="off"
            className="h-11 w-full rounded-control border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${board}-sort`} className="text-sm font-medium">
            Sort by date
          </label>
          <select
            id={`${board}-sort`}
            name="sort"
            defaultValue={query.sort}
            className="h-11 rounded-control border border-border bg-surface px-3 text-base text-foreground"
          >
            <option value="open">Opening date</option>
            <option value="close">Closing date</option>
            <option value="listing">Listing date</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${board}-direction`} className="text-sm font-medium">
            Order
          </label>
          <select
            id={`${board}-direction`}
            name="direction"
            defaultValue={query.direction}
            className="h-11 rounded-control border border-border bg-surface px-3 text-base text-foreground"
          >
            <option value="asc">Earliest first</option>
            <option value="desc">Latest first</option>
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground"
        >
          Apply
        </button>
      </form>
    </div>
  );
}
