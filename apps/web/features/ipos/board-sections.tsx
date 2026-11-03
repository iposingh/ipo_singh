import type { Board, IpoSummary } from "@ipo-singh/contracts";
import { ActionLink } from "@/components/layout/action-link";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionHeader } from "@/components/ui/section-header";
import { isIpoGuruSource } from "@/features/ipo-details/source-credit";
import { latestRetrievedAt, SourceAttribution } from "@/features/ipo-details/source-attribution";
import { listingFailureCopy } from "@/features/ipos/listing-state";
import type { ListingSectionPage } from "@/features/ipos/listing-sections";
import type { ListingLoadStatus } from "@/lib/api/ipo-singh";
import { SummaryList } from "@/features/ipos/summary-list";

export function BoardListingSections({
  board,
  sections,
  today,
  now,
}: {
  board: Board;
  sections: readonly ListingSectionPage[];
  today: string;
  now: string;
}) {
  const closed = sections.find((section) => section.section.id === "closed") ?? null;
  const visible = sections.filter((section) => section.section.id !== "closed");
  const stamps = sections.flatMap((section) => section.items.map((ipo) => ipo.provenance.retrievedAt));
  const guru = sections.some((section) => section.items.some((ipo) => isIpoGuruSource(ipo.provenance.sourceName)));
  return (
    <div className="grid gap-10">
      {visible.map((section) => {
        const merged = section.section.id === "open" && closed ? mergeOpen(section, closed) : { items: section.status === "ready" ? section.items : [], failures: section.status === "ready" ? [] : [{ title: section.section.title, status: section.status }] };
        return (
          <section key={section.section.id} className="grid gap-4" aria-labelledby={`${board}-${section.section.id}`}>
            <SectionHeader
              id={`${board}-${section.section.id}`}
              title={section.section.title}
              action={
                section.section.id === "listed" ? (
                  <div className="flex flex-wrap gap-2">
                    <ActionLink href={`/ipos/listed?board=${board}`} variant="secondary">
                      Listing history
                    </ActionLink>
                    <ActionLink href={section.section.href} variant="secondary">
                      View all
                    </ActionLink>
                  </div>
                ) : (
                  <ActionLink href={section.section.href} variant="secondary">
                    View all
                  </ActionLink>
                )
              }
            />
            {merged.failures.map((failure) => {
              const copy = listingFailureCopy(failure.status, failure.title);
              return <ErrorState key={failure.title} title={copy.title} message={copy.message} />;
            })}
            {merged.items.length === 0 && merged.failures.length === 0 ? (
              <EmptyState title={section.section.emptyTitle} description={section.section.emptyDescription} />
            ) : merged.items.length > 0 ? (
              <SummaryList
                items={merged.items}
                today={today}
                now={now}
                variant={section.section.id === "listed" ? "listed" : "active"}
                showBoard={false}
                emptyTitle={section.section.emptyTitle}
                emptyDescription={section.section.emptyDescription}
              />
            ) : null}
          </section>
        );
      })}
      {guru ? <SourceAttribution retrievedAt={latestRetrievedAt(stamps)} /> : null}
    </div>
  );
}

function mergeOpen(open: ListingSectionPage, closed: ListingSectionPage): { items: IpoSummary[]; failures: { title: string; status: Exclude<ListingLoadStatus, "ready"> }[] } {
  const failures = [open, closed].flatMap((section) => (section.status === "ready" ? [] : [{ title: section.section.title, status: section.status }]));
  const items = arrangeOpen([
    ...(open.status === "ready" ? open.items : []),
    ...(closed.status === "ready" ? closed.items : []),
  ]);
  return { items, failures };
}

function arrangeOpen(items: readonly IpoSummary[]): IpoSummary[] {
  const seen = new Set<string>();
  const unique = items.filter((ipo) => {
    if (seen.has(ipo.id)) return false;
    seen.add(ipo.id);
    return ipo.status === "open" || ipo.status === "closed" || ipo.status === "allotment";
  });
  const bidding = unique.filter((ipo) => ipo.status === "open").sort((left, right) => (left.closeDate ?? "9999").localeCompare(right.closeDate ?? "9999"));
  const waiting = unique.filter((ipo) => ipo.status !== "open");
  return [...bidding, ...waiting];
}
