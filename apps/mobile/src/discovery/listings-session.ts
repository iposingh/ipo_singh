import {
  defaultListingsQuery,
  defaultSortForStatus,
  type ListingsDirection,
  type ListingsQuery,
  type ListingsSort,
  type ListingsStatusFilter,
} from "./listings-query.ts";
import type { Board } from "@ipo-singh/contracts";

let session: ListingsQuery = { ...defaultListingsQuery };

export function readListingsSession(): ListingsQuery {
  return { ...session };
}

export function writeListingsSession(patch: Partial<ListingsQuery>): ListingsQuery {
  session = { ...session, ...patch };
  return { ...session };
}

export function setListingsBoard(board: Board): ListingsQuery {
  return writeListingsSession({ board });
}

export function setListingsStatus(status: ListingsStatusFilter): ListingsQuery {
  return writeListingsSession({ status, ...defaultSortForStatus(status) });
}

export function setListingsQueryText(query: string): ListingsQuery {
  return writeListingsSession({ query });
}

export function setListingsSort(sort: ListingsSort, direction?: ListingsDirection): ListingsQuery {
  return writeListingsSession({
    sort,
    direction: direction ?? (sort === "listing" || sort === "close" ? "desc" : "asc"),
  });
}

export function setListingsDirection(direction: ListingsDirection): ListingsQuery {
  return writeListingsSession({ direction });
}

/** Test helper. */
export function resetListingsSession(value: ListingsQuery = defaultListingsQuery): void {
  session = { ...value };
}
