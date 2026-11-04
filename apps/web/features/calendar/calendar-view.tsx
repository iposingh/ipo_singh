import Link from "next/link";
import type { CalendarEntry } from "@ipo-singh/contracts";
import { ActionLink } from "@/components/layout/action-link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { CalendarAgenda } from "@/features/calendar/calendar-agenda";
import { CalendarList } from "@/features/calendar/calendar-list";
import { CalendarMobileLegend, CalendarMonth } from "@/features/calendar/calendar-month";
import {
  calendarPath,
  filterCalendarEntries,
  monthBounds,
  selectedCalendarDay,
  shiftMonth,
  type CalendarBoard,
  type CalendarEventFilter,
  type CalendarPageQuery,
  type CalendarView as CalendarViewName,
} from "@/features/calendar/month";
import { isIpoGuruSource } from "@/features/ipo-details/source-credit";
import { latestRetrievedAt, SourceAttribution } from "@/features/ipo-details/source-attribution";

const views: readonly { value: CalendarViewName; label: string }[] = [
  { value: "calendar", label: "Calendar" },
  { value: "list", label: "List" },
];

const boards: readonly { value: CalendarBoard; label: string }[] = [
  { value: "all", label: "All IPOs" },
  { value: "mainboard", label: "Mainboard" },
  { value: "sme", label: "SME" },
];

const events: readonly { value: CalendarEventFilter; label: string }[] = [
  { value: "all", label: "All events" },
  { value: "open", label: "Opening" },
  { value: "close", label: "Closing" },
  { value: "allotment", label: "Allotment" },
  { value: "listing", label: "Listing" },
];

function chipClass(current: boolean): string {
  return current
    ? "inline-flex h-10 items-center rounded-control bg-surface px-3 text-sm font-medium text-foreground"
    : "inline-flex h-10 items-center rounded-control px-3 text-sm font-medium text-muted hover:bg-surface hover:text-foreground";
}

export function CalendarView({
  query,
  entries,
  today = null,
  truncated = false,
  unavailable = false,
  pending = false,
}: {
  query: CalendarPageQuery;
  entries: readonly CalendarEntry[];
  today?: string | null;
  truncated?: boolean;
  unavailable?: boolean;
  pending?: boolean;
}) {
  const bounds = monthBounds(query.month);
  const label = bounds?.label ?? query.month;
  const previous = shiftMonth(query.month, -1);
  const next = shiftMonth(query.month, 1);
  const visible = filterCalendarEntries(entries, query.event);
  const selected = selectedCalendarDay(query, today);
  const agenda = visible.filter((entry) => entry.date === selected);
  const todayMonth = today && today.length >= 7 ? today.slice(0, 7) : null;
  const credit = visible.some((entry) => isIpoGuruSource(entry.ipo.provenance.sourceName));
  return (
    <PageContainer className="grid gap-6">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "IPO Calendar" }]} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="IPO Calendar"
          description="Opening, closing, allotment, and listing dates stored for this month. Dates use the India calendar. A missing date is left blank."
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Month" className="flex flex-wrap items-center gap-2">
          {previous ? (
            <ActionLink href={calendarPath({ ...query, month: previous, day: null })} variant="secondary">
              Previous
            </ActionLink>
          ) : null}
          <h2 className="min-w-36 text-center text-lg font-semibold">{label}</h2>
          {next ? (
            <ActionLink href={calendarPath({ ...query, month: next, day: null })} variant="secondary">
              Next
            </ActionLink>
          ) : null}
          {todayMonth ? (
            <ActionLink href={calendarPath({ ...query, month: todayMonth, day: null })} variant="secondary">
              Today
            </ActionLink>
          ) : null}
        </nav>
        <div className="flex flex-wrap gap-2" role="navigation" aria-label="Calendar view">
          {views.map((view) => (
            <Link
              key={view.value}
              href={calendarPath({ ...query, view: view.value })}
              aria-current={query.view === view.value ? "page" : undefined}
              className={chipClass(query.view === view.value)}
            >
              {view.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2" role="navigation" aria-label="Board">
          {boards.map((board) => (
            <Link
              key={board.value}
              href={calendarPath({ ...query, board: board.value })}
              aria-current={query.board === board.value ? "page" : undefined}
              className={chipClass(query.board === board.value)}
            >
              {board.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="navigation" aria-label="Event type">
          {events.map((event) => (
            <Link
              key={event.value}
              href={calendarPath({ ...query, event: event.value })}
              aria-current={query.event === event.value ? "page" : undefined}
              className={chipClass(query.event === event.value)}
            >
              {event.label}
            </Link>
          ))}
        </div>
      </div>
      {pending ? (
        <LoadingState label={`Loading ${label}`} />
      ) : unavailable ? (
        <ErrorState
          title="The calendar could not be loaded"
          message="The IPO Singh calendar could not be read. No dates were substituted."
          action={
            <ActionLink href={calendarPath(query)} variant="secondary">
              Try again
            </ActionLink>
          }
        />
      ) : (
        <div className="grid gap-6">
          {query.view === "list" ? (
            visible.length > 0 ? (
              <CalendarList entries={visible} credit={false} />
            ) : (
              <EmptyState
                title={`No stored dates in ${label}`}
                description="Open, close, allotment, and listing dates appear when IPO Singh has stored them. An empty month does not add a date."
              />
            )
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
              <div className="grid gap-3">
                <CalendarMobileLegend />
                <CalendarMonth query={query} entries={visible} today={today} selected={selected} />
              </div>
              <CalendarAgenda date={selected} entries={agenda} />
            </div>
          )}
          {truncated ? <p className="text-sm text-muted">More stored dates in this month were not loaded.</p> : null}
          {credit ? <SourceAttribution retrievedAt={latestRetrievedAt(visible.map((entry) => entry.ipo.provenance.retrievedAt))} /> : null}
        </div>
      )}
    </PageContainer>
  );
}
