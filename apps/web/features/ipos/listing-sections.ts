import type { Board, IpoSummary } from "@ipo-singh/contracts";
import type { ListingLoadStatus } from "@/lib/api/ipo-singh";
import { browsePath, defaultBrowseQuery, type IpoBrowseQuery, type IpoStatusFilter } from "./browse.ts";

export const listingPageSize = 20;
export const sectionPreviewLimit = 8;

export type ListingSection = {
  id: "open" | "upcoming" | "closed" | "listed";
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  href: string;
  query: IpoBrowseQuery;
};

/** Open, upcoming, recently closed, and recently listed. Each board keeps its own route. */
export function listingSections(board: Board): readonly ListingSection[] {
  const sections: Omit<ListingSection, "href">[] = [
    {
      id: "open",
      title: "Open IPOs",
      description: "",
      emptyTitle: "No open IPOs right now.",
      emptyDescription: "",
      query: { q: "", status: "open", sort: "close", direction: "asc" },
    },
    {
      id: "upcoming",
      title: "Upcoming IPOs",
      description: "",
      emptyTitle: "No upcoming IPOs available.",
      emptyDescription: "",
      query: { q: "", status: "upcoming", sort: "open", direction: "asc" },
    },
    {
      id: "closed",
      title: "Recently closed IPOs",
      description: "",
      emptyTitle: "No recently closed IPOs.",
      emptyDescription: "",
      query: { q: "", status: "closed", sort: "close", direction: "desc" },
    },
    {
      id: "listed",
      title: "Recently listed IPOs",
      description: "",
      emptyTitle: "No recently listed IPOs.",
      emptyDescription: "",
      query: { q: "", status: "listed", sort: "listing", direction: "desc" },
    },
  ];
  return sections.map((section) => ({ ...section, href: browsePath(board, section.query) }));
}

export type ListingSectionPage = {
  section: ListingSection;
  status: ListingLoadStatus;
  items: readonly IpoSummary[];
  totalCount: number | null;
};

/** The default board page. A status, search, or custom sort opens one list instead. */
export function isListingOverview(query: IpoBrowseQuery): boolean {
  return query.status === "all" && query.q === "" && query.sort === defaultBrowseQuery.sort && query.direction === defaultBrowseQuery.direction;
}

export function statusFilterPath(board: Board, status: IpoStatusFilter, q: string): string {
  if (status === "all") return browsePath(board, { ...defaultBrowseQuery, q });
  if (status === "allotment") return browsePath(board, { q, status, sort: "close", direction: "desc" });
  const section = listingSections(board).find((item) => item.query.status === status);
  return browsePath(board, { ...(section?.query ?? defaultBrowseQuery), status, q });
}

export function parseListingPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^[1-9][0-9]{0,2}$/.test(raw)) return 1;
  const page = Number(raw);
  return page > 100 ? 1 : page;
}

export function listingPath(board: Board, query: IpoBrowseQuery, page = 1): string {
  const path = browsePath(board, query);
  if (page <= 1) return path;
  return `${path}${path.includes("?") ? "&" : "?"}page=${page}`;
}

export function listingPageCount(totalCount: number | null, pageSize = listingPageSize): number {
  if (totalCount === null || totalCount <= 0) return 1;
  return Math.ceil(totalCount / pageSize);
}

export function paginateItems<T>(items: readonly T[], page: number, pageSize = listingPageSize): {
  pageItems: T[];
  pageCount: number;
} {
  if (items.length === 0) return { pageItems: [], pageCount: 1 };
  const pageCount = Math.ceil(items.length / pageSize);
  const start = (page - 1) * pageSize;
  if (start >= items.length) return { pageItems: [], pageCount };
  return { pageItems: items.slice(start, start + pageSize), pageCount };
}
