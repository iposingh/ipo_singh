import type { Board, CalendarEntry } from "@ipo-singh/contracts";
import { istCalendarDate } from "@ipo-singh/core";

export type CalendarView = "calendar" | "list";
export type CalendarBoard = "all" | Board;
export type CalendarEventFilter = "all" | CalendarEntry["event"];

export type CalendarPageQuery = {
  month: string;
  view: CalendarView;
  board: CalendarBoard;
  event: CalendarEventFilter;
  /** Explicit India date. Null keeps the current India date when it falls in the month. */
  day: string | null;
};

export type EventCounts = Record<CalendarEntry["event"], number>;

export type MonthDay = {
  date: string;
  events: CalendarEntry[];
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const eventFilters: readonly CalendarEventFilter[] = ["all", "open", "close", "allotment", "listing"];

function firstParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim();
}

export function parseMonth(value: string | undefined): string | null {
  if (!value || !monthPattern.test(value)) return null;
  return value;
}

/** India calendar month for an instant. A missing instant does not invent a month. */
export function currentMonth(now: Date): string | null {
  const iso = istCalendarDate(now);
  return iso ? iso.slice(0, 7) : null;
}

export function monthBounds(month: string): { from: string; to: string; label: string } | null {
  if (!parseMonth(month)) return null;
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const name = monthNames[monthNumber - 1];
  if (!name) return null;
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
    label: `${name} ${year}`,
  };
}

export function shiftMonth(month: string, delta: number): string | null {
  if (!parseMonth(month)) return null;
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  const nextYear = shifted.getUTCFullYear();
  const nextMonth = shifted.getUTCMonth() + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

/** Monday is 0. The instant is noon in India so the weekday is the India date, not the previous UTC date. */
export function indiaWeekdayMondayIndex(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  const instant = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 6, 30));
  return (instant.getUTCDay() + 6) % 7;
}

/**
 * Weeks for one month. A day is empty when the source stored no event on it.
 * Dates outside the month are padding cells and carry no events.
 */
export function monthWeeks(month: string, entries: readonly CalendarEntry[]): (MonthDay | null)[][] {
  const bounds = monthBounds(month);
  if (!bounds) return [];
  const byDate = new Map<string, CalendarEntry[]>();
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.date < bounds.from || entry.date > bounds.to) continue;
    const key = `${entry.date}:${entry.event}:${entry.ipo.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byDate.get(entry.date) ?? [];
    list.push(entry);
    byDate.set(entry.date, list);
  }
  const count = Number(bounds.to.slice(8, 10));
  const cells: (MonthDay | null)[] = Array.from({ length: indiaWeekdayMondayIndex(bounds.from) }, () => null);
  for (let day = 1; day <= count; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    cells.push({ date, events: byDate.get(date) ?? [] });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (MonthDay | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

export function parseCalendarPageQuery(
  params: {
    month?: string | string[];
    view?: string | string[];
    board?: string | string[];
    event?: string | string[];
    day?: string | string[];
  },
  now: Date,
): CalendarPageQuery | null {
  const month = parseMonth(firstParam(params.month)) ?? currentMonth(now);
  if (!month) return null;
  const board = firstParam(params.board);
  const event = firstParam(params.event);
  const day = firstParam(params.day);
  return {
    month,
    view: firstParam(params.view) === "list" ? "list" : "calendar",
    board: board === "mainboard" || board === "sme" ? board : "all",
    event: eventFilters.includes(event as CalendarEventFilter) ? (event as CalendarEventFilter) : "all",
    day: dayPattern.test(day) ? day : null,
  };
}

export function filterCalendarEntries(entries: readonly CalendarEntry[], event: CalendarEventFilter): CalendarEntry[] {
  if (event === "all") return [...entries];
  return entries.filter((entry) => entry.event === event);
}

export function eventCounts(entries: readonly CalendarEntry[]): EventCounts {
  const counts: EventCounts = { open: 0, close: 0, allotment: 0, listing: 0 };
  for (const entry of entries) counts[entry.event] += 1;
  return counts;
}

/** The selected India date. An explicit day outside the month falls back to today, then the first of the month. */
export function selectedCalendarDay(query: CalendarPageQuery, today: string | null): string {
  const bounds = monthBounds(query.month);
  if (!bounds) return `${query.month}-01`;
  if (query.day && query.day >= bounds.from && query.day <= bounds.to) return query.day;
  if (today && today >= bounds.from && today <= bounds.to) return today;
  return bounds.from;
}

export function calendarPath(query: CalendarPageQuery): string {
  const params = new URLSearchParams();
  params.set("month", query.month);
  if (query.view !== "calendar") params.set("view", query.view);
  if (query.board !== "all") params.set("board", query.board);
  if (query.event !== "all") params.set("event", query.event);
  if (query.day) params.set("day", query.day);
  return `/ipo-calendar?${params.toString()}`;
}
