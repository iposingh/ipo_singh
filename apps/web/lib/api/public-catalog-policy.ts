import type { Board, IpoStatus } from "@ipo-singh/contracts";
import type { ListingLoadStatus } from "./ipo-singh.ts";

/**
 * Thrown from a `use cache` scope so failed / incomplete catalogue reads are not stored
 * as successful cache entries. Callers map these back to existing unavailable statuses.
 */
export class PublicCatalogUnavailableError extends Error {
  readonly status: ListingLoadStatus;

  constructor(status: ListingLoadStatus = "unexpected") {
    super(`Public catalogue unavailable (${status})`);
    this.name = "PublicCatalogUnavailableError";
    this.status = status;
  }
}

export class PublicCatalogMissingError extends Error {
  constructor() {
    super("Public catalogue issue missing");
    this.name = "PublicCatalogMissingError";
  }
}

export class PublicCatalogSearchRejectedError extends Error {
  readonly status: "short" | "invalid";

  constructor(status: "short" | "invalid") {
    super(`Public catalogue search rejected (${status})`);
    this.name = "PublicCatalogSearchRejectedError";
    this.status = status;
  }
}

/** Documented Next.js freshness bounds for public IPO reads (seconds). */
export const publicCatalogFreshness = {
  listings: { stale: 30, revalidate: 60, expire: 300 },
  issue: { stale: 30, revalidate: 60, expire: 300 },
  history: { stale: 60, revalidate: 120, expire: 600 },
  calendar: { stale: 30, revalidate: 60, expire: 300 },
  promotions: { stale: 30, revalidate: 60, expire: 300 },
} as const;

/** Stable board/status helpers for tests and docs — does not change API semantics. */
export function publicListingCacheIdentity(input: {
  board: Board;
  status?: IpoStatus;
  q?: string;
  sort?: string;
  direction?: string;
  page?: number;
  limit?: number;
}): string {
  return [
    input.board,
    input.status ?? "",
    input.q ?? "",
    input.sort ?? "",
    input.direction ?? "",
    String(input.page ?? 1),
    String(input.limit ?? ""),
  ].join("|");
}
