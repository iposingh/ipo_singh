import type { Board, Ipo, IpoStatus } from "@ipo-singh/contracts";

export type IpoStatusFilter = "all" | "open" | "upcoming" | "closed" | "allotment" | "listed";
export type IpoDateSort = "open" | "close" | "listing";
export type SortDirection = "asc" | "desc";

export type IpoBrowseQuery = {
  q: string;
  status: IpoStatusFilter;
  sort: IpoDateSort;
  direction: SortDirection;
};

export const defaultBrowseQuery: IpoBrowseQuery = {
  q: "",
  status: "all",
  sort: "open",
  direction: "asc",
};

const statusFilters: readonly IpoStatusFilter[] = ["all", "open", "upcoming", "closed", "allotment", "listed"];
const dateSorts: readonly IpoDateSort[] = ["open", "close", "listing"];

function firstParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim();
}

export function parseBrowseQuery(params: {
  q?: string | string[];
  status?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
}): IpoBrowseQuery {
  const status = firstParam(params.status);
  const sort = firstParam(params.sort);
  const direction = firstParam(params.direction);
  return {
    q: firstParam(params.q).slice(0, 80),
    status: statusFilters.includes(status as IpoStatusFilter) ? (status as IpoStatusFilter) : "all",
    sort: dateSorts.includes(sort as IpoDateSort) ? (sort as IpoDateSort) : "open",
    direction: direction === "desc" ? "desc" : "asc",
  };
}

export function browsePath(board: Board, query: IpoBrowseQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "all") params.set("status", query.status);
  if (query.sort !== "open") params.set("sort", query.sort);
  if (query.direction !== "asc") params.set("direction", query.direction);
  const text = params.toString();
  return text ? `/ipos/${board}?${text}` : `/ipos/${board}`;
}

/**
 * Closed includes allotment because the issue is no longer open and is not yet listed.
 * A missing status stays out of every specific filter.
 */
export function matchesStatus(status: IpoStatus | null, filter: IpoStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "closed") return status === "closed" || status === "allotment";
  if (filter === "allotment") return status === "allotment";
  return status === filter;
}

function sortDate(ipo: Ipo, sort: IpoDateSort): string | null {
  if (sort === "close") return ipo.dates.closeDate;
  if (sort === "listing") return ipo.dates.listingDate;
  return ipo.dates.openDate;
}

export function browseIpos(ipos: readonly Ipo[], query: IpoBrowseQuery): Ipo[] {
  const q = query.q.trim().toLowerCase();
  return ipos
    .filter((ipo) => matchesStatus(ipo.status, query.status))
    .filter((ipo) => (q ? ipo.companyName.toLowerCase().includes(q) : true))
    .slice()
    .sort((left, right) => {
      const leftDate = sortDate(left, query.sort);
      const rightDate = sortDate(right, query.sort);
      if (leftDate !== rightDate) {
        if (!leftDate) return 1;
        if (!rightDate) return -1;
        const order = leftDate < rightDate ? -1 : 1;
        return query.direction === "asc" ? order : -order;
      }
      return left.companyName.localeCompare(right.companyName);
    });
}
