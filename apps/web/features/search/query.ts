import { isIsoDate } from "@ipo-singh/core";
import type { Board, IpoStatus } from "@ipo-singh/contracts";

const boards = ["mainboard", "sme"] as const;
const statuses = ["upcoming", "open", "closed", "allotment", "listed"] as const;
const cursorPattern = /^[A-Za-z0-9_-]{1,200}$/;

export type SearchRequest = {
  q: string;
  board?: Board;
  status?: IpoStatus;
  from?: string;
  to?: string;
  cursor?: string;
};

export type SearchFilters = {
  /** Safe text sent to IPO Singh. Empty when the text is rejected. */
  q: string;
  /** Text shown in the box, including a rejected value. */
  queryText: string;
  board: "all" | Board;
  status: "all" | IpoStatus;
  from: string | null;
  to: string | null;
  cursor: string | null;
  rejected: "none" | "text" | "dates" | "filters";
  cursorIgnored: boolean;
};

export type SearchParamInput = {
  q?: string | string[];
  board?: string | string[];
  status?: string | string[];
  from?: string | string[];
  to?: string | string[];
  cursor?: string | string[];
};

export type SearchParamSource = SearchParamInput | URLSearchParams;

export const emptySearchFilters: SearchFilters = {
  q: "",
  queryText: "",
  board: "all",
  status: "all",
  from: null,
  to: null,
  cursor: null,
  rejected: "none",
  cursorIgnored: false,
};

function readParam(source: SearchParamSource, key: string): string {
  if (source instanceof URLSearchParams) return source.get(key) ?? "";
  const value = source[key as keyof SearchParamInput];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function sanitizeSearchText(value: string): { text: string; display: string; rejected: boolean } {
  const trimmed = value.trim();
  const display = trimmed.slice(0, 80);
  if (trimmed.includes("<") || trimmed.includes(">") || hasControlCharacter(trimmed)) {
    return { text: "", display, rejected: true };
  }
  return { text: display, display, rejected: false };
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    if ((character.codePointAt(0) ?? 0) <= 31) return true;
  }
  return false;
}

function readChoice<T extends string>(value: string, allowed: readonly T[]): { value: "all" | T; invalid: boolean } {
  if (value === "" || value === "all") return { value: "all", invalid: false };
  if (allowed.includes(value as T)) return { value: value as T, invalid: false };
  return { value: "all", invalid: true };
}

function readDate(value: string): { date: string | null; invalid: boolean } {
  const trimmed = value.trim();
  if (!trimmed) return { date: null, invalid: false };
  if (!isIsoDate(trimmed)) return { date: null, invalid: true };
  return { date: trimmed, invalid: false };
}

function readCursor(value: string): { cursor: string | null; ignored: boolean } {
  const trimmed = value.trim();
  if (!trimmed) return { cursor: null, ignored: false };
  if (!cursorPattern.test(trimmed)) return { cursor: null, ignored: true };
  return { cursor: trimmed, ignored: false };
}

export function parseSearchFilters(source: SearchParamSource): SearchFilters {
  const text = sanitizeSearchText(readParam(source, "q"));
  const board = readChoice(readParam(source, "board"), boards);
  const status = readChoice(readParam(source, "status"), statuses);
  const from = readDate(readParam(source, "from"));
  const to = readDate(readParam(source, "to"));
  const cursor = readCursor(readParam(source, "cursor"));
  let rejected: SearchFilters["rejected"] = "none";
  if (text.rejected) rejected = "text";
  else if (from.invalid || to.invalid || (from.date !== null && to.date !== null && from.date > to.date)) rejected = "dates";
  else if (board.invalid || status.invalid) rejected = "filters";
  return {
    q: text.text,
    queryText: text.display,
    board: board.value,
    status: status.value,
    from: from.date,
    to: to.date,
    cursor: rejected === "none" ? cursor.cursor : null,
    rejected,
    cursorIgnored: rejected === "none" && cursor.ignored,
  };
}

export function searchCatalogQuery(filters: SearchFilters): SearchRequest | null {
  if (filters.rejected !== "none" || filters.q.length < 2) return null;
  const request: SearchRequest = { q: filters.q };
  if (filters.board !== "all") request.board = filters.board;
  if (filters.status !== "all") request.status = filters.status;
  if (filters.from) request.from = filters.from;
  if (filters.to) request.to = filters.to;
  if (filters.cursor) request.cursor = filters.cursor;
  return request;
}

export function searchPath(filters: Pick<SearchFilters, "q" | "board" | "status" | "from" | "to" | "cursor">): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.board !== "all") params.set("board", filters.board);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.cursor) params.set("cursor", filters.cursor);
  const text = params.toString();
  return text ? `/search?${text}` : "/search";
}

export function searchBoxKey(filters: SearchFilters): string {
  return [
    filters.rejected,
    encodeURIComponent(filters.queryText),
    filters.board,
    filters.status,
    filters.from ?? "",
    filters.to ?? "",
    filters.cursor ?? "",
  ].join("|");
}

export function searchRequestKey(request: SearchRequest): string {
  return JSON.stringify({
    q: request.q,
    board: request.board ?? null,
    status: request.status ?? null,
    from: request.from ?? null,
    to: request.to ?? null,
    cursor: request.cursor ?? null,
  });
}

export function parseSearchRequestKey(key: string): SearchRequest | null {
  let value: unknown;
  try {
    value = JSON.parse(key);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.q !== "string") return null;
  return searchCatalogQuery(
    parseSearchFilters({
      q: record.q,
      board: typeof record.board === "string" ? record.board : undefined,
      status: typeof record.status === "string" ? record.status : undefined,
      from: typeof record.from === "string" ? record.from : undefined,
      to: typeof record.to === "string" ? record.to : undefined,
      cursor: typeof record.cursor === "string" ? record.cursor : undefined,
    }),
  );
}
