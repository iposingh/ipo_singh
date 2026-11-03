import type { IpoSummary } from "@ipo-singh/contracts";
import { istCalendarDate } from "@ipo-singh/core";
import { ActionLink } from "@/components/layout/action-link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { SiteSearch } from "@/components/layout/site-search";
import { JsonLd } from "@/components/seo/json-ld";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionHeader } from "@/components/ui/section-header";
import { CalendarList } from "@/features/calendar/calendar-list";
import { loadCalendar, loadListingPage } from "@/features/ipos/catalog";
import { isIpoGuruSource } from "@/features/ipo-details/source-credit";
import { latestRetrievedAt, SourceAttribution } from "@/features/ipo-details/source-attribution";
import { listingFailureCopy } from "@/features/ipos/listing-state";
import { SummaryList } from "@/features/ipos/summary-list";
import { currentAppPromotion } from "@/features/promotions/app-promo";
import { AdCarousel } from "@/features/promotions/ad-carousel";
import { AppDownloadBanner } from "@/features/promotions/app-download-banner";
import { loadHomePromotions } from "@/features/promotions/load";
import type { ListingLoadStatus } from "@/lib/api/ipo-singh";
import { siteUrl } from "@/lib/seo/site";
import { homeDocument, type LinkedItem } from "@/lib/seo/structured-data";

const homePreviewLimit = 8;

type HomeBucket = {
  id: "open" | "upcoming" | "listed";
  title: string;
  href: string;
  emptyTitle: string;
  items: IpoSummary[];
  failures: { title: string; status: Exclude<ListingLoadStatus, "ready"> }[];
};

export async function HomeView() {
  const [buckets, calendar] = await Promise.all([loadHomeBuckets(), loadCalendar()]);
  const now = new Date();
  const today = istCalendarDate(now) ?? "";
  const preview = calendar.status === "ready" ? calendar.entries.slice(0, 6) : [];
  const origin = siteUrl();
  const promotions = await loadHomePromotions();
  const app = currentAppPromotion();
  const stamps = buckets.flatMap((bucket) => bucket.items.map((ipo) => ipo.provenance.retrievedAt));
  const guru = buckets.some((bucket) => bucket.items.some((ipo) => isIpoGuruSource(ipo.provenance.sourceName)));
  return (
    <PageContainer className="grid gap-10">
      {origin ? <JsonLd data={homeDocument(origin, homeLinks(buckets))} /> : null}
      <section className="grid gap-6">
        <PageHeader eyebrow="IPO Singh" title="All IPO insights. One place." description="Open issues, upcoming issues, and recent listing performance." />
        {promotions.length > 0 ? <AdCarousel slides={promotions} /> : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <ActionLink href="/ipos/mainboard">Mainboard IPOs</ActionLink>
          <ActionLink href="/ipos/sme" variant="secondary">
            SME IPOs
          </ActionLink>
          <ActionLink href="/allotment" variant="secondary">
            Allotment
          </ActionLink>
          <ActionLink href="/ipo-calendar" variant="secondary">
            IPO Calendar
          </ActionLink>
        </div>
        <SiteSearch id="home-search" className="max-w-xl" />
        <AppDownloadBanner promo={app} />
      </section>

      {buckets.every((bucket) => bucket.failures.length > 0 && bucket.items.length === 0) ? (
        <ErrorState
          title={listingFailureCopy(buckets[0]?.failures[0]?.status ?? "backend", "IPOs").title}
          message="The IPO Singh catalogue could not be read. No sample issues were substituted."
          action={
            <ActionLink href="/" variant="secondary">
              Try again
            </ActionLink>
          }
        />
      ) : (
        buckets.map((bucket) => (
          <section key={bucket.id} className="grid gap-4">
            <SectionHeader
              title={bucket.title}
              action={
                <ActionLink href={bucket.href} variant="secondary">
                  View all
                </ActionLink>
              }
            />
            {bucket.failures.map((failure) => {
              const copy = listingFailureCopy(failure.status, failure.title);
              return <ErrorState key={failure.title} title={copy.title} message={copy.message} />;
            })}
            {bucket.items.length === 0 && bucket.failures.length === 0 ? (
              <EmptyState title={bucket.emptyTitle} description="" />
            ) : bucket.items.length > 0 ? (
              <SummaryList
                items={bucket.items}
                today={today}
                now={now.toISOString()}
                variant={bucket.id === "listed" ? "listed" : "active"}
                showBoard={false}
                emptyTitle={bucket.emptyTitle}
                emptyDescription=""
              />
            ) : null}
          </section>
        ))
      )}

      <section className="grid gap-4">
        <SectionHeader
          title="IPO Calendar"
          action={
            <ActionLink href="/ipo-calendar" variant="secondary">
              Open calendar
            </ActionLink>
          }
        />
        {calendar.status === "unavailable" ? (
          <ErrorState title="The calendar could not be loaded" message="IPO Singh's calendar could not be read. No dates were substituted." />
        ) : preview.length === 0 ? (
          <EmptyState title="No calendar dates are stored" description="" />
        ) : (
          <CalendarList entries={preview} credit={false} />
        )}
      </section>
      {guru ? <SourceAttribution retrievedAt={latestRetrievedAt(stamps)} /> : null}
    </PageContainer>
  );
}

async function loadHomeBuckets(): Promise<HomeBucket[]> {
  const [open, closed, upcoming, listed] = await Promise.all([
    loadListingPage({ board: "mainboard", status: "open", sort: "close", direction: "asc", page: 1, limit: homePreviewLimit }),
    loadListingPage({ board: "mainboard", status: "closed", sort: "close", direction: "desc", page: 1, limit: homePreviewLimit }),
    loadListingPage({ board: "mainboard", status: "upcoming", sort: "open", direction: "asc", page: 1, limit: homePreviewLimit }),
    loadListingPage({ board: "mainboard", status: "listed", sort: "listing", direction: "desc", page: 1, limit: homePreviewLimit }),
  ]);
  return [
    {
      id: "open",
      title: "Open IPOs",
      href: "/ipos/mainboard?status=open&sort=close",
      emptyTitle: "No open IPOs right now.",
      ...combine(open, closed),
    },
    {
      id: "upcoming",
      title: "Upcoming IPOs",
      href: "/ipos/mainboard?status=upcoming&sort=open",
      emptyTitle: "No upcoming IPOs available.",
      items: upcoming.status === "ready" ? [...upcoming.items] : [],
      failures: upcoming.status === "ready" ? [] : [{ title: "Upcoming IPOs", status: upcoming.status }],
    },
    {
      id: "listed",
      title: "Recently Listed IPOs",
      href: "/ipos/listed?board=mainboard",
      emptyTitle: "No recently listed IPOs.",
      items: listed.status === "ready" ? [...listed.items] : [],
      failures: listed.status === "ready" ? [] : [{ title: "Recently listed IPOs", status: listed.status }],
    },
  ];
}

function combine(
  open: Awaited<ReturnType<typeof loadListingPage>>,
  closed: Awaited<ReturnType<typeof loadListingPage>>,
): Pick<HomeBucket, "items" | "failures"> {
  const failures = [open, closed].flatMap((page, index) =>
    page.status === "ready" ? [] : [{ title: index === 0 ? "Open IPOs" : "Allotment-stage IPOs", status: page.status }],
  );
  const seen = new Set<string>();
  const items = [...(open.status === "ready" ? open.items : []), ...(closed.status === "ready" ? closed.items : [])].filter((ipo) => {
    if (seen.has(ipo.id) || (ipo.status !== "open" && ipo.status !== "closed" && ipo.status !== "allotment")) return false;
    seen.add(ipo.id);
    return true;
  });
  const bidding = items.filter((ipo) => ipo.status === "open").sort((left, right) => (left.closeDate ?? "9999").localeCompare(right.closeDate ?? "9999"));
  const waiting = items.filter((ipo) => ipo.status !== "open");
  return { items: [...bidding, ...waiting], failures };
}

function homeLinks(buckets: readonly HomeBucket[]): LinkedItem[] {
  const seen = new Set<string>();
  const links: LinkedItem[] = [];
  for (const bucket of buckets) {
    for (const ipo of bucket.items) {
      if (seen.has(ipo.slug)) continue;
      seen.add(ipo.slug);
      links.push({ name: ipo.companyName, path: `/ipos/${ipo.slug}` });
    }
  }
  return links;
}
