import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { istCalendarDate } from "@ipo-singh/core";
import { JsonLd } from "@/components/seo/json-ld";
import { PageContainer } from "@/components/layout/page-container";
import { LoadingState } from "@/components/ui/loading-state";
import { CalendarView } from "@/features/calendar/calendar-view";
import { monthBounds, parseCalendarPageQuery } from "@/features/calendar/month";
import { loadCalendarMonth } from "@/features/ipos/catalog";
import { calendarIsIndexable } from "@/lib/seo/indexing";
import { pageMetadata } from "@/lib/seo/metadata";
import { siteUrl } from "@/lib/seo/site";
import { webPageDocument } from "@/lib/seo/structured-data";

type CalendarParams = Promise<{
  month?: string | string[];
  view?: string | string[];
  board?: string | string[];
  event?: string | string[];
  day?: string | string[];
}>;

const description =
  "Stored IPO opening, closing, allotment, and listing dates in India Standard Time. Missing dates are left off the calendar.";

export async function generateMetadata({ searchParams }: { searchParams: CalendarParams }): Promise<Metadata> {
  await connection();
  const raw = await searchParams;
  const query = parseCalendarPageQuery(raw, new Date());
  const label = query ? monthBounds(query.month)?.label : null;
  const index = calendarIsIndexable(raw);
  return pageMetadata({
    title: label && !index ? `IPO Calendar, ${label}` : "IPO Calendar",
    description,
    path: "/ipo-calendar",
    index,
  });
}

export default function IpoCalendarPage({ searchParams }: { searchParams: CalendarParams }) {
  return (
    <Suspense
      fallback={
        <PageContainer className="grid gap-6">
          <LoadingState label="Loading IPO calendar" />
        </PageContainer>
      }
    >
      <IpoCalendarContent searchParams={searchParams} />
    </Suspense>
  );
}

async function IpoCalendarContent({ searchParams }: { searchParams: CalendarParams }) {
  await connection();
  const now = new Date();
  const today = istCalendarDate(now);
  const query = parseCalendarPageQuery(await searchParams, now);
  if (!query) {
    return (
      <PageContainer className="grid gap-6">
        <LoadingState label="Loading IPO calendar" />
      </PageContainer>
    );
  }
  const bounds = monthBounds(query.month);
  if (!bounds) {
    return (
      <PageContainer className="grid gap-6">
        <LoadingState label="Loading IPO calendar" />
      </PageContainer>
    );
  }
  const loaded = await loadCalendarMonth(bounds.from, bounds.to, query.board);
  const origin = siteUrl();
  const index = calendarIsIndexable(await searchParams);
  return (
    <>
      {origin && index ? (
        <JsonLd data={webPageDocument(origin, { name: "IPO Calendar", path: "/ipo-calendar", description })} />
      ) : null}
      <CalendarView
      query={query}
      today={today}
      entries={loaded.status === "ready" ? loaded.entries : []}
      truncated={loaded.status === "ready" ? loaded.truncated : false}
      unavailable={loaded.status === "unavailable"}
    />
    </>
  );
}
