import type { Board, CalendarEntry, IpoStatus } from "@ipo-singh/contracts";
import { catalogueReadLimit } from "../../db/repositories.ts";
import type { DirectoryRow } from "./present.ts";

export const defaultPageLimit = 20;

const calendarOrder = ["open", "close", "allotment", "listing"] as const;

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const text = Buffer.from(cursor, "base64url").toString("utf8");
  if (!/^(?:0|[1-9][0-9]{0,5})$/.test(text)) {
    throw new CursorError();
  }
  const offset = Number(text);
  if (offset > catalogueReadLimit) throw new CursorError();
  return offset;
}

export class CursorError extends Error {
  constructor() {
    super("Cursor is invalid.");
    this.name = "CursorError";
  }
}

/** Closed includes allotment. A missing status matches only an unfiltered list. */
export function matchesStatus(status: IpoStatus | null, filter: IpoStatus | undefined): boolean {
  if (!filter) return true;
  if (filter === "closed") return status === "closed" || status === "allotment";
  return status === filter;
}

export function matchesSearch(row: DirectoryRow, q: string | undefined): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (row.summary.companyName.toLowerCase().includes(needle)) return true;
  if (row.summary.slug.includes(needle)) return true;
  return row.symbol !== null && row.symbol.toLowerCase().includes(needle);
}

function sortDate(row: DirectoryRow, sort: "open" | "close" | "listing"): string | null {
  if (sort === "close") return row.summary.closeDate;
  if (sort === "listing") return row.listingDate;
  return row.summary.openDate;
}

export function sortDirectory(
  rows: readonly DirectoryRow[],
  sort: "open" | "close" | "listing",
  direction: "asc" | "desc",
): DirectoryRow[] {
  return rows.slice().sort((left, right) => {
    const leftDate = sortDate(left, sort);
    const rightDate = sortDate(right, sort);
    if (leftDate !== rightDate) {
      if (!leftDate) return 1;
      if (!rightDate) return -1;
      const order = leftDate < rightDate ? -1 : 1;
      return direction === "asc" ? order : -order;
    }
    return left.summary.slug.localeCompare(right.summary.slug);
  });
}

/** A range matches a stored open, close, or listing date. Allotment is not included. */
function matchesDateRange(row: DirectoryRow, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const dates = [row.summary.openDate, row.summary.closeDate, row.listingDate].filter(
    (date): date is string => typeof date === "string",
  );
  return dates.some((date) => (from === undefined || date >= from) && (to === undefined || date <= to));
}

export function filterDirectory(
  rows: readonly DirectoryRow[],
  query: {
    board?: Board;
    status?: IpoStatus;
    q?: string;
    from?: string;
    to?: string;
    sort: "open" | "close" | "listing";
    direction: "asc" | "desc";
  },
): DirectoryRow[] {
  const matched = rows.filter((row) => {
    if (query.board && row.summary.board !== query.board) return false;
    if (!matchesStatus(row.summary.status, query.status)) return false;
    if (!matchesSearch(row, query.q)) return false;
    return matchesDateRange(row, query.from, query.to);
  });
  return sortDirectory(matched, query.sort, query.direction);
}

export function pageOf<T>(items: readonly T[], offset: number, limit: number, truncated: boolean) {
  const slice = items.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  return {
    items: slice,
    page: {
      limit,
      nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
      totalCount: truncated ? null : items.length,
    },
  };
}

export function calendarEntries(
  rows: readonly DirectoryRow[],
  query: { board?: Board; from?: string; to?: string },
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const row of rows) {
    if (query.board && row.summary.board !== query.board) continue;
    const dates = [
      ["open", row.summary.openDate],
      ["close", row.summary.closeDate],
      ["allotment", row.allotmentDate],
      ["listing", row.listingDate],
    ] as const;
    for (const [event, date] of dates) {
      if (!date) continue;
      if (query.from && date < query.from) continue;
      if (query.to && date > query.to) continue;
      entries.push({ date, event, ipo: row.summary });
    }
  }
  return entries.sort((left, right) => {
    if (left.date !== right.date) return left.date < right.date ? -1 : 1;
    const eventOrder = calendarOrder.indexOf(left.event) - calendarOrder.indexOf(right.event);
    if (eventOrder !== 0) return eventOrder;
    return left.ipo.slug.localeCompare(right.ipo.slug);
  });
}

/** End of the close date in Asia/Kolkata, which does not observe daylight saving. */
export function closeInstant(closeDate: string | null): Date | null {
  if (!closeDate) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(closeDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day, 18, 29, 59, 999));
}
