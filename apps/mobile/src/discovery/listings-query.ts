import type { Board, IpoStatus } from "@ipo-singh/contracts";
import { prepareSearchText } from "../design/copy.ts";

export const listingsPageLimit = 20;
export const listingsSearchDebounceMs = 300;

export type ListingsStatusFilter = "all" | "open" | "upcoming" | "allotment" | "listed";
export type ListingsSort = "open" | "close" | "listing";
export type ListingsDirection = "asc" | "desc";

export type ListingsQuery = {
  board: Board;
  status: ListingsStatusFilter;
  query: string;
  sort: ListingsSort;
  direction: ListingsDirection;
};

export const defaultListingsQuery: ListingsQuery = {
  board: "mainboard",
  status: "all",
  query: "",
  sort: "open",
  direction: "asc",
};

export const listingsStatusFilters: readonly { value: ListingsStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "upcoming", label: "Upcoming" },
  { value: "allotment", label: "Allotment" },
  { value: "listed", label: "Listed" },
];

export const listingsSortOptions: readonly { value: ListingsSort; label: string }[] = [
  { value: "open", label: "Open date" },
  { value: "close", label: "Close date" },
  { value: "listing", label: "Listing date" },
];

/** Sensible catalogue sort when the status filter changes. */
export function defaultSortForStatus(status: ListingsStatusFilter): Pick<ListingsQuery, "sort" | "direction"> {
  if (status === "listed") return { sort: "listing", direction: "desc" };
  if (status === "allotment") return { sort: "close", direction: "desc" };
  if (status === "open") return { sort: "close", direction: "asc" };
  if (status === "upcoming") return { sort: "open", direction: "asc" };
  return { sort: "open", direction: "asc" };
}

/**
 * Maps UI filters to API status.
 * Allotment uses `closed` so the catalogue includes closed (awaited) and allotment (out) issues.
 * Cards still distinguish Allotment Awaited vs Allotment Out via allotmentConfirmed.
 */
export function apiStatusForFilter(status: ListingsStatusFilter): IpoStatus | undefined {
  if (status === "all") return undefined;
  if (status === "allotment") return "closed";
  return status;
}

export function preparedListingsQuery(query: string): string | null {
  const prepared = prepareSearchText(query);
  return prepared.status === "ready" ? prepared.text : null;
}

export function ipoListRequestPath(
  filters: {
    board: Board;
    status?: IpoStatus;
    sort: ListingsSort;
    direction: ListingsDirection;
    q?: string;
  },
  cursor?: string,
): string {
  const params = new URLSearchParams();
  params.set("board", filters.board);
  if (filters.status) params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  params.set("sort", filters.sort);
  params.set("direction", filters.direction);
  params.set("limit", String(listingsPageLimit));
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/ipos?${params.toString()}`;
}

export function listingsReloadKey(input: ListingsQuery): string {
  const q = preparedListingsQuery(input.query) ?? "";
  return [input.board, input.status, q, input.sort, input.direction].join("|");
}
