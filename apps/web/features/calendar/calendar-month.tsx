import Link from "next/link";
import type { CalendarEntry } from "@ipo-singh/contracts";
import { calendarPath, eventCounts, monthWeeks, type CalendarPageQuery } from "@/features/calendar/month";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const calendarEventOrder = ["open", "close", "allotment", "listing"] as const satisfies readonly CalendarEntry["event"][];

export const calendarEventLabel: Record<CalendarEntry["event"], string> = {
  open: "Opening",
  close: "Closing",
  allotment: "Allotment",
  listing: "Listing",
};

const countLabel = calendarEventLabel;

const countClass: Record<CalendarEntry["event"], string> = {
  open: "text-primary-solid",
  close: "text-rose-700 dark:text-rose-300",
  allotment: "text-violet-700 dark:text-violet-300",
  listing: "text-amber-700 dark:text-amber-300",
};

export const calendarEventDotClass: Record<CalendarEntry["event"], string> = {
  open: "bg-primary-solid",
  close: "bg-rose-600",
  allotment: "bg-violet-600",
  listing: "bg-amber-500",
};

const dotClass = calendarEventDotClass;

/** Compact color key for mobile month cells that show dots instead of labels. Hidden from `sm` up. */
export function CalendarMobileLegend() {
  return (
    <ul
      aria-label="Calendar event colors"
      className="flex flex-wrap gap-x-3 gap-y-2 sm:hidden"
    >
      {calendarEventOrder.map((event) => (
        <li key={event} className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className={`h-2 w-2 shrink-0 rounded-full ${calendarEventDotClass[event]}`} aria-hidden="true" />
          <span>{calendarEventLabel[event]}</span>
        </li>
      ))}
    </ul>
  );
}

export function CalendarMonth({
  query,
  entries,
  today,
  selected,
}: {
  query: CalendarPageQuery;
  entries: readonly CalendarEntry[];
  today: string | null;
  selected: string;
}) {
  const weeks = monthWeeks(query.month, entries);
  return (
    <div className="overflow-hidden rounded-panel border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border bg-background">
        {weekdays.map((day) => (
          <div key={day} className="px-1 py-2 text-center text-xs font-medium text-muted sm:px-2 sm:text-sm">
            <span className="sm:hidden">{day.slice(0, 1)}</span>
            <span className="hidden sm:inline">{day}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((day, index) =>
          day ? (
            <DayCell key={day.date} query={query} date={day.date} events={day.events} today={today === day.date} selected={selected === day.date} />
          ) : (
            <div key={`pad-${index}`} className="h-16 border-b border-r border-border bg-background sm:h-28" />
          ),
        )}
      </div>
    </div>
  );
}

function DayCell({
  query,
  date,
  events,
  today,
  selected,
}: {
  query: CalendarPageQuery;
  date: string;
  events: readonly CalendarEntry[];
  today: boolean;
  selected: boolean;
}) {
  const counts = eventCounts(events);
  const dayNumber = Number(date.slice(8, 10));
  const summary = (Object.keys(countLabel) as CalendarEntry["event"][])
    .filter((event) => counts[event] > 0)
    .map((event) => `${counts[event]} ${countLabel[event]}`)
    .join(", ");
  return (
    <Link
      href={calendarPath({ ...query, day: date })}
      aria-current={selected ? "date" : undefined}
      aria-label={summary ? `${date}, ${summary}` : `${date}, no events`}
      className={`flex h-16 flex-col gap-1 overflow-hidden border-b border-r border-border p-1.5 outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-primary-solid sm:h-28 sm:p-2 ${
        selected ? "bg-primary/15" : today ? "bg-background" : "bg-surface"
      }`}
    >
      <span className={`text-sm font-semibold tabular-nums ${today ? "text-primary-solid" : "text-foreground"}`}>{dayNumber}</span>
      <span className="flex gap-1 sm:hidden" aria-hidden="true">
        {(Object.keys(dotClass) as CalendarEntry["event"][]).map((event) =>
          counts[event] > 0 ? <span key={event} className={`mt-1 h-1.5 w-1.5 rounded-full ${dotClass[event]}`} /> : null,
        )}
      </span>
      <span className="hidden min-h-0 flex-col gap-0.5 overflow-hidden text-xs leading-4 sm:flex">
        {(Object.keys(countLabel) as CalendarEntry["event"][]).map((event) =>
          counts[event] > 0 ? (
            <span key={event} className={`truncate ${countClass[event]}`}>
              {counts[event]} {countLabel[event]}
            </span>
          ) : null,
        )}
      </span>
    </Link>
  );
}
