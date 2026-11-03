import type { Board, IpoStatus } from "@ipo-singh/contracts";
import { prepareSearchText } from "../design/copy.ts";
import type { ListingsDirection, ListingsSort } from "./listings-query.ts";

const pageLimit = 20;
const calendarPageLimit = 100;

export function searchRequestPath(
  query: string,
  filters: {
    board?: Board;
    status?: IpoStatus;
    sort?: ListingsSort;
    direction?: ListingsDirection;
  } = {},
  cursor?: string,
): string | null {
  const prepared = prepareSearchText(query);
  if (prepared.status !== "ready") return null;
  const params = new URLSearchParams();
  params.set("q", prepared.text);
  params.set("limit", String(pageLimit));
  if (filters.board) params.set("board", filters.board);
  if (filters.status) params.set("status", filters.status);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.direction) params.set("direction", filters.direction);
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/search?${params.toString()}`;
}

export function calendarRequestPath(input: { board?: Board; from?: string; to?: string; cursor?: string; limit?: number } = {}): string {
  const params = new URLSearchParams();
  if (input.board) params.set("board", input.board);
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  params.set("limit", String(input.limit ?? pageLimit));
  if (input.cursor) params.set("cursor", input.cursor);
  return `/api/v1/calendar?${params.toString()}`;
}

export { calendarPageLimit };
