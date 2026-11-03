import Link from "next/link";
import type { Board, IpoSummary } from "@ipo-singh/contracts";
import { formatIstDate, istCalendarDate } from "@ipo-singh/core";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionHeader } from "@/components/ui/section-header";
import { allotmentLink } from "@/features/allotment/link";
import { isIpoGuruSource } from "@/features/ipo-details/source-credit";
import { latestRetrievedAt, SourceAttribution } from "@/features/ipo-details/source-attribution";
import { IndiaDate } from "@/features/ipos/ipo-facts";
import { boardLabel } from "@/features/ipos/labels";
import { listingFailureCopy } from "@/features/ipos/listing-state";
import { loadListingPage } from "@/features/ipos/catalog";
import { currentAppPromotion } from "@/features/promotions/app-promo";
import { AppDownloadBanner } from "@/features/promotions/app-download-banner";
import type { ListingLoadStatus } from "@/lib/api/ipo-singh";

type LoadFailure = { title: string; status: Exclude<ListingLoadStatus, "ready"> };

export type AllotmentBoardFilter = "all" | Board;

export async function AllotmentBoard({ board }: { board: AllotmentBoardFilter }) {
  const boards: Board[] = board === "all" ? ["mainboard", "sme"] : [board];
  const loaded = await Promise.all(
    boards.map((item) => loadListingPage({ board: item, status: "closed", sort: "close", direction: "desc", page: 1, limit: 20 })),
  );
  const now = new Date();
  const today = istCalendarDate(now) ?? "";
  const failures: LoadFailure[] = loaded.flatMap((page, index) =>
    page.status === "ready" ? [] : [{ title: boardLabel(boards[index] ?? "mainboard"), status: page.status }],
  );
  const items = loaded.flatMap((page) => (page.status === "ready" ? page.items : []));
  const confirmed = items.filter((ipo) => ipo.allotmentConfirmed === true);
  const awaiting = items.filter((ipo) => ipo.allotmentConfirmed !== true && (ipo.status === "closed" || ipo.status === "allotment"));
  const guru = items.some((ipo) => isIpoGuruSource(ipo.provenance.sourceName));
  return (
    <PageContainer className="grid gap-8">
      <PageHeader title="Allotment" description="Allotment out is shown only when a stored result confirms it. A passed date stays unconfirmed." />
      <BoardFilters current={board} />
      {failures.map((failure) => {
        const copy = listingFailureCopy(failure.status, failure.title);
        return <ErrorState key={failure.title} title={copy.title} message={copy.message} />;
      })}
      <AllotmentGroup title="Allotment Out" empty="No confirmed allotment results are stored." items={confirmed} today={today} confirmed />
      <AllotmentGroup title="Awaiting allotment" empty="No IPOs are waiting on allotment." items={awaiting} today={today} confirmed={false} />
      <AppDownloadBanner promo={currentAppPromotion()} />
      {guru ? <SourceAttribution retrievedAt={latestRetrievedAt(items.map((ipo) => ipo.provenance.retrievedAt))} /> : null}
    </PageContainer>
  );
}

function BoardFilters({ current }: { current: AllotmentBoardFilter }) {
  const options: { value: AllotmentBoardFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "mainboard", label: "Mainboard" },
    { value: "sme", label: "SME" },
  ];
  return (
    <nav aria-label="IPO board" className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Link
          key={option.value}
          href={option.value === "all" ? "/allotment" : `/allotment?board=${option.value}`}
          aria-current={option.value === current ? "page" : undefined}
          className={`inline-flex h-10 items-center rounded-control px-3 text-sm font-medium ${option.value === current ? "bg-surface text-foreground" : "text-muted"}`}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

function AllotmentGroup({
  title,
  empty,
  items,
  today,
  confirmed,
}: {
  title: string;
  empty: string;
  items: readonly IpoSummary[];
  today: string;
  confirmed: boolean;
}) {
  return (
    <section className="grid gap-4">
      <SectionHeader title={title} />
      {items.length === 0 ? (
        <EmptyState title={empty} description="" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((ipo) => (
            <li key={ipo.id}>
              <AllotmentCard ipo={ipo} today={today} confirmed={confirmed} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AllotmentCard({ ipo, today, confirmed }: { ipo: IpoSummary; today: string; confirmed: boolean }) {
  const link = allotmentLink(ipo.allotmentUrl, { confirmed, registrarName: ipo.registrarName });
  const passed = Boolean(ipo.allotmentDate && ipo.allotmentDate < today);
  return (
    <article className="grid gap-3 rounded-panel border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{boardLabel(ipo.board)}</Badge>
        {confirmed ? <Badge tone="positive">Allotment Out</Badge> : <Badge tone="warning">{passed ? "Result not confirmed" : "Allotment Awaited"}</Badge>}
      </div>
      <h2 className="text-base font-semibold">
        <Link href={`/ipos/${ipo.slug}`} className="underline-offset-2 hover:underline">
          {ipo.companyName}
        </Link>
      </h2>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Closes</dt>
          <dd><IndiaDate value={ipo.closeDate} /></dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{confirmed ? "Allotment" : "Expected allotment"}</dt>
          <dd>{ipo.allotmentDate ? formatIstDate(ipo.allotmentDate) : "Date unavailable"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted">Registrar</dt>
          <dd>{ipo.registrarName ?? "Registrar unavailable"}</dd>
        </div>
      </dl>
      {link.href ? (
        <a href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground">
          Check Allotment
        </a>
      ) : (
        <Button type="button" disabled>
          Check Allotment
        </Button>
      )}
      <p className="text-sm text-muted">
        {passed && !confirmed ? "The expected allotment date has passed. The result is not confirmed. " : ""}
        {link.note}
      </p>
    </article>
  );
}
