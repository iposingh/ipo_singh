import Link from "next/link";
import type { IpoSummary } from "@ipo-singh/contracts";
import { ActionLink } from "@/components/layout/action-link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { CompareTable } from "@/features/compare/compare-table";
import { ShareComparison } from "@/features/compare/share-link";
import { buildCompareRows, type CompareColumn } from "@/features/compare/rows";
import { compareCapacity, comparePath, withSlug, withoutSlug, type CompareSelection } from "@/features/compare/selection";
import { BoardBadge, StatusBadge } from "@/features/ipos/ipo-facts";

export function CompareView({
  selection,
  columns = [],
  matches = [],
  search = "idle",
  truncated = false,
  unavailable = false,
  pending = false,
}: {
  selection: CompareSelection;
  columns?: readonly CompareColumn[];
  matches?: readonly IpoSummary[];
  search?: "idle" | "short" | "ready" | "unavailable";
  truncated?: boolean;
  unavailable?: boolean;
  pending?: boolean;
}) {
  const rows = unavailable || pending ? [] : buildCompareRows(columns);
  const path = comparePath(selection.slugs, selection.q);
  const sharePath = comparePath(selection.slugs);
  const ready = !pending && !unavailable && selection.slugs.length >= 2;
  return (
    <PageContainer className="grid gap-6">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Compare" }]} />
      <PageHeader
        title="Compare IPOs"
        description="Choose two to four stored issues. Figures stay side by side, including missing values. GMP does not guarantee listing returns, and this page does not recommend an issue."
      />
      <CompareSearch selection={selection} />
      {selection.overflow ? <p className="text-sm text-muted">Only the first four issues in the address are compared.</p> : null}
      {selection.slugs.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Selected IPOs">
          {selection.slugs.map((slug) => {
            const column = columns.find((item) => (item.state === "stored" ? item.ipo.slug === slug : item.slug === slug));
            const name = column?.state === "stored" ? column.ipo.companyName : slug;
            return (
              <li key={slug} className="inline-flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm">
                <span>{name}</span>
                <Link href={comparePath(withoutSlug(selection.slugs, slug), selection.q)} className="font-medium text-link underline-offset-2 hover:underline">
                  Remove
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {pending ? (
        <LoadingState label="Loading comparison" />
      ) : unavailable ? (
        <ErrorState
          title="The comparison could not be loaded"
          message="The IPO Singh catalogue could not be read. No sample issues were substituted."
          action={
            <ActionLink href={path} variant="secondary">
              Try again
            </ActionLink>
          }
        />
      ) : selection.slugs.length < 2 ? (
        <EmptyState
          title={selection.slugs.length === 0 ? "Select stored IPOs" : "Add another IPO"}
          description={
            selection.slugs.length === 0
              ? "Search for a stored issue and add it. A comparison starts at two issues and stops at four."
              : "One stored issue is not ranked. Add a second issue to see the figures side by side."
          }
        />
      ) : (
        <div className="grid gap-4">
          <ShareComparison path={sharePath} />
          {ready ? <CompareTable columns={columns} rows={rows} /> : null}
        </div>
      )}
      <CompareMatches selection={selection} matches={matches} search={search} truncated={truncated} />
    </PageContainer>
  );
}

function CompareSearch({ selection }: { selection: CompareSelection }) {
  return (
    <form key={`${selection.q}:${selection.slugs.join(",")}`} action="/compare" method="get" role="search" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      {selection.slugs.map((slug) => (
        <input key={slug} type="hidden" name="ipo" value={slug} />
      ))}
      <div className="grid gap-1.5">
        <label htmlFor="compare-search" className="text-sm font-medium">
          Find an IPO to add
        </label>
        <input
          id="compare-search"
          name="q"
          type="search"
          defaultValue={selection.q}
          placeholder="Company name"
          autoComplete="off"
          className="h-11 w-full rounded-control border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted"
        />
      </div>
      <button type="submit" className="inline-flex h-11 items-center justify-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground">
        Search
      </button>
    </form>
  );
}

function CompareMatches({
  selection,
  matches,
  search,
  truncated,
}: {
  selection: CompareSelection;
  matches: readonly IpoSummary[];
  search: "idle" | "short" | "ready" | "unavailable";
  truncated: boolean;
}) {
  if (search === "idle") return null;
  if (search === "short") {
    return (
      <EmptyState title="Enter at least 2 characters" description="Search is sent to IPO Singh after 2 characters. A shorter query does not invent matches." />
    );
  }
  if (search === "unavailable") {
    return <ErrorState title="Search could not be loaded" message="The IPO Singh catalogue could not be read. No sample issues were substituted." />;
  }
  if (matches.length === 0) {
    return (
      <EmptyState
        title={`No stored IPO matches “${selection.q}”`}
        description="Search checks issues stored by IPO Singh. An empty result is not added to the comparison."
      />
    );
  }
  const full = selection.slugs.length >= compareCapacity;
  return (
    <div className="grid gap-3">
      <h2 className="text-base font-semibold">Add an issue</h2>
      <ul className="grid gap-2">
        {matches.map((item) => {
          const added = selection.slugs.includes(item.slug);
          return (
            <li key={item.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface px-4 py-3">
              <div className="grid gap-1">
                <Link href={`/ipos/${item.slug}`} className="font-medium underline-offset-2 hover:underline">
                  {item.companyName}
                </Link>
                <div className="flex flex-wrap gap-2">
                  <BoardBadge board={item.board} />
                  <StatusBadge status={item.status} allotmentConfirmed={item.allotmentConfirmed} />
                </div>
              </div>
              {added ? (
                <span className="text-sm text-muted">Added</span>
              ) : full ? (
                <span className="text-sm text-muted">Four issues selected</span>
              ) : (
                <Link href={comparePath(withSlug(selection.slugs, item.slug), selection.q)} className="inline-flex h-10 items-center rounded-control px-3 text-sm font-medium text-link underline-offset-2 hover:underline">
                  Add
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {truncated ? <p className="text-sm text-muted">More stored matches were not loaded. Refine the name to narrow the list.</p> : null}
    </div>
  );
}
