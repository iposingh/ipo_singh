import { calendarEntrySchema, ipoSummarySchema, pageSchema, type Board, type CalendarEntry, type IpoStatus, type IpoSummary } from "@ipo-singh/contracts";
import { requestJson } from "../api/client.ts";
import { MobileApiError, apiFailureMessage } from "../api/errors.ts";
import { calendarPageLimit, calendarRequestPath, searchRequestPath } from "../discovery/requests.ts";
import { apiStatusForFilter, ipoListRequestPath, preparedListingsQuery, type ListingsQuery } from "../discovery/listings-query.ts";
import { refreshSummaryLifecycle } from "./lifecycle.ts";

const pageLimit = 20;
const summaryPageSchema = pageSchema(ipoSummarySchema);
const calendarPageSchema = pageSchema(calendarEntrySchema);

export type PageResult<T> =
  | { status: "ready"; items: T[]; nextCursor: string | null }
  | { status: "offline" }
  | { status: "configuration"; message: string }
  | { status: "unavailable"; message: string };

export function pageFailureMessage(result: Exclude<PageResult<unknown>, { status: "ready" }>): string {
  if (result.status === "offline") return apiFailureMessage.offline;
  return result.message;
}

export type PageRequest = {
  origin: string;
  cursor?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  offline?: boolean;
  board?: Board;
  status?: IpoStatus;
  sort?: "open" | "close" | "listing";
  direction?: "asc" | "desc";
  from?: string;
  to?: string;
  limit?: number;
  now?: Date;
};

function withCursor(path: string, cursor: string | undefined): string {
  if (!cursor) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}cursor=${encodeURIComponent(cursor)}`;
}

async function settleSummaries(
  offline: boolean | undefined,
  work: () => Promise<{ items: IpoSummary[]; page: { nextCursor: string | null } }>,
  now = new Date(),
): Promise<PageResult<IpoSummary>> {
  if (offline) return { status: "offline" };
  try {
    const page = await work();
    return {
      status: "ready",
      items: page.items.map((item) => refreshSummaryLifecycle(item, now)),
      nextCursor: page.page.nextCursor,
    };
  } catch (error) {
    if (error instanceof MobileApiError) {
      if (error.kind === "cancelled") throw error;
      return { status: "unavailable", message: error.message };
    }
    return { status: "unavailable", message: apiFailureMessage.network };
  }
}

async function settle<T>(offline: boolean | undefined, work: () => Promise<{ items: T[]; page: { nextCursor: string | null } }>): Promise<PageResult<T>> {
  if (offline) return { status: "offline" };
  try {
    const page = await work();
    return { status: "ready", items: page.items, nextCursor: page.page.nextCursor };
  } catch (error) {
    if (error instanceof MobileApiError) {
      if (error.kind === "cancelled") throw error;
      return { status: "unavailable", message: error.message };
    }
    return { status: "unavailable", message: apiFailureMessage.network };
  }
}

export function loadBoardPage(board: "mainboard" | "sme", input: PageRequest): Promise<PageResult<IpoSummary>> {
  const path = withCursor(`/api/v1/ipos?board=${board}&limit=${pageLimit}`, input.cursor);
  return settleSummaries(
    input.offline,
    () => requestJson({ origin: input.origin, path, schema: summaryPageSchema, fetchImpl: input.fetchImpl, signal: input.signal }),
    input.now,
  );
}

export function loadSearchPage(query: string, input: PageRequest): Promise<PageResult<IpoSummary>> {
  const path = searchRequestPath(
    query,
    {
      board: input.board,
      status: input.status,
      sort: input.sort,
      direction: input.direction,
    },
    input.cursor,
  );
  if (!path) {
    return Promise.resolve({ status: "unavailable", message: "Enter a company name or symbol of at least 2 characters." });
  }
  return settleSummaries(
    input.offline,
    () => requestJson({ origin: input.origin, path, schema: summaryPageSchema, fetchImpl: input.fetchImpl, signal: input.signal }),
    input.now,
  );
}

/** Browse or search the catalogue using summary rows only (no per-IPO detail fetches). */
export function loadListingsPage(query: ListingsQuery, input: PageRequest): Promise<PageResult<IpoSummary>> {
  const q = preparedListingsQuery(query.query);
  const status = apiStatusForFilter(query.status);
  if (q) {
    return loadSearchPage(q, {
      ...input,
      board: query.board,
      status,
      sort: query.sort,
      direction: query.direction,
    });
  }
  const path = ipoListRequestPath(
    {
      board: query.board,
      status,
      sort: query.sort,
      direction: query.direction,
    },
    input.cursor,
  );
  return settleSummaries(
    input.offline,
    () => requestJson({ origin: input.origin, path, schema: summaryPageSchema, fetchImpl: input.fetchImpl, signal: input.signal }),
    input.now,
  );
}

export function loadCalendarPage(input: PageRequest): Promise<PageResult<CalendarEntry>> {
  const path = calendarRequestPath({ board: input.board, from: input.from, to: input.to, cursor: input.cursor, limit: input.limit });
  return settle(input.offline, () =>
    requestJson({ origin: input.origin, path, schema: calendarPageSchema, fetchImpl: input.fetchImpl, signal: input.signal }),
  );
}

export async function loadCalendarRange(input: PageRequest & { from: string; to: string }): Promise<PageResult<CalendarEntry>> {
  const items: CalendarEntry[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page += 1) {
    if (cursor) {
      if (seen.has(cursor)) return { status: "unavailable", message: apiFailureMessage.malformed };
      seen.add(cursor);
    }
    const result = await loadCalendarPage({ ...input, cursor, limit: input.limit ?? calendarPageLimit });
    if (result.status !== "ready") return result;
    items.push(...result.items);
    if (!result.nextCursor) return { status: "ready", items, nextCursor: null };
    cursor = result.nextCursor;
  }
  return { status: "unavailable", message: "The calendar page could not be finished." };
}
