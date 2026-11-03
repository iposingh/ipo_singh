import type { Board, CalendarEntry } from "@ipo-singh/contracts";
import { istCalendarDate } from "@ipo-singh/core";

export type CalendarBoard = "all" | Board;
export type CalendarEventKind = CalendarEntry["event"];

export type MonthDay = {
  date: string;
  events: CalendarEntry[];
};

export type EventCounts = Record<CalendarEventKind, number>;

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

/** Stable chronological order for events that share one India calendar date. */
export const calendarEventOrder: readonly CalendarEventKind[] = ["open", "close", "allotment", "listing"];

export function parseMonth(value: string | undefined): string | null {
  if (!value || !monthPattern.test(value)) return null;
  return value;
}

export function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && dayPattern.test(value);
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
  return `${String(shifted.getUTCFullYear()).padStart(4, "0")}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function dateInMonth(date: string, month: string): boolean {
  const bounds = monthBounds(month);
  if (!bounds || !isIsoDate(date)) return false;
  return date >= bounds.from && date <= bounds.to;
}

/**
 * Selected India date for the visible month.
 * Keeps an in-month selection, otherwise today when it falls in the month, otherwise the 1st.
 */
export function selectedCalendarDay(input: {
  month: string;
  selected: string | null;
  today: string | null;
}): string {
  const bounds = monthBounds(input.month);
  if (!bounds) return `${input.month}-01`;
  if (input.selected && dateInMonth(input.selected, input.month)) return input.selected;
  if (input.today && dateInMonth(input.today, input.month)) return input.today;
  return bounds.from;
}

/** Monday is 0. Noon IST (06:30 UTC) keeps the weekday on the India date, not the previous UTC day. */
export function indiaWeekdayMondayIndex(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  const instant = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 6, 30));
  return (instant.getUTCDay() + 6) % 7;
}

export function eventCounts(entries: readonly CalendarEntry[]): EventCounts {
  const counts: EventCounts = { open: 0, close: 0, allotment: 0, listing: 0 };
  for (const entry of entries) counts[entry.event] += 1;
  return counts;
}

export function sortDayEvents(entries: readonly CalendarEntry[]): CalendarEntry[] {
  return [...entries].sort((left, right) => {
    if (left.date !== right.date) return left.date < right.date ? -1 : 1;
    const order = calendarEventOrder.indexOf(left.event) - calendarEventOrder.indexOf(right.event);
    if (order !== 0) return order;
    const board = left.ipo.board.localeCompare(right.ipo.board);
    if (board !== 0) return board;
    return left.ipo.slug.localeCompare(right.ipo.slug);
  });
}

/**
 * Weeks for one month. Missing dates stay empty. Duplicate slug+event pairs
 * (for example after a revised date still lingering in a stale page) are dropped.
 * Dates outside the month are padding and carry no events.
 */
export function monthWeeks(month: string, entries: readonly CalendarEntry[]): (MonthDay | null)[][] {
  const bounds = monthBounds(month);
  if (!bounds) return [];
  const byDate = new Map<string, CalendarEntry[]>();
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!isIsoDate(entry.date)) continue;
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
    cells.push({ date, events: sortDayEvents(byDate.get(date) ?? []) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (MonthDay | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

export function eventsOn(weeks: readonly (MonthDay | null)[][], date: string): CalendarEntry[] {
  for (const week of weeks) {
    for (const day of week) {
      if (day?.date === date) return day.events;
    }
  }
  return [];
}

/** Board filter for the calendar request. Default Mainboard omits `all`. */
export function calendarBoardParam(board: CalendarBoard): Board | undefined {
  return board === "all" ? undefined : board;
}
