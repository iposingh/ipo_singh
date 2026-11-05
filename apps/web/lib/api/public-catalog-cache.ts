import { cacheLife, cacheTag } from "next/cache";
import { internalServiceHeaders } from "./internal-headers.ts";
import {
  PublicCatalogMissingError,
  PublicCatalogSearchRejectedError,
  PublicCatalogUnavailableError,
} from "./public-catalog-policy.ts";
import {
  loadCalendarCatalog,
  loadDetailCatalog,
  loadIpoDocuments,
  loadListedCatalog,
  loadListingSummaries,
  loadSearchCatalog,
  loadSearchSummaries,
  loadSitemapCatalog,
  type CalendarCatalogQuery,
  type CalendarCatalogResult,
  type CompareDocumentsResult,
  type ListedCatalogResult,
  type ListingPageResult,
  type ListingQuery,
  type SearchCatalogQuery,
  type SearchCatalogResult,
  type SearchSummaryOptions,
  type SearchSummaryResult,
  type SitemapCatalogResult,
} from "./ipo-singh.ts";

export {
  PublicCatalogMissingError,
  PublicCatalogSearchRejectedError,
  PublicCatalogUnavailableError,
  publicCatalogFreshness,
  publicListingCacheIdentity,
} from "./public-catalog-policy.ts";

type ReadyListingPage = ListingPageResult & { status: "ready" };
type ReadyListedCatalog = Extract<ListedCatalogResult, { status: "ready" }>;
type ReadyCalendarCatalog = Extract<CalendarCatalogResult, { status: "ready" }>;
type ReadyDetailCatalog = Extract<Awaited<ReturnType<typeof loadDetailCatalog>>, { status: "ready" }>;
type ReadyCompareDocuments = Extract<CompareDocumentsResult, { status: "ready" }>;
type ReadySearchCatalog = Extract<SearchCatalogResult, { status: "ready" }>;
type ReadySearchSummaries = Extract<SearchSummaryResult, { status: "ready" }>;
type ReadySitemapCatalog = Extract<SitemapCatalogResult, { status: "ready" }>;

function listingQueryKey(query: ListingQuery): ListingQuery {
  return {
    board: query.board,
    status: query.status,
    q: query.q,
    sort: query.sort,
    direction: query.direction,
    page: query.page ?? 1,
    limit: query.limit,
  };
}

/** Successful listing summary pages only. Failures throw and are not cached. */
export async function cachedListingSummaries(origin: string, query: ListingQuery): Promise<ReadyListingPage> {
  "use cache";
  cacheLife("ipoListings");
  cacheTag("ipo-public", "ipo-listings");
  const result = await loadListingSummaries(listingQueryKey(query), { origin });
  if (result.status !== "ready") throw new PublicCatalogUnavailableError(result.status);
  return { status: "ready", items: result.items, totalCount: result.totalCount };
}

/** Successful listed-catalogue aggregation. Failures throw and are not cached. */
export async function cachedListedCatalog(origin: string): Promise<ReadyListedCatalog> {
  "use cache";
  cacheLife("ipoListings");
  cacheTag("ipo-public", "ipo-listed");
  const result = await loadListedCatalog({ origin });
  if (result.status !== "ready") throw new PublicCatalogUnavailableError("unexpected");
  return result;
}

/** Successful month/board calendar pages. Failures throw and are not cached. */
export async function cachedCalendarCatalog(
  origin: string,
  query: CalendarCatalogQuery = {},
): Promise<ReadyCalendarCatalog> {
  "use cache";
  cacheLife("ipoCalendar");
  cacheTag("ipo-public", "ipo-calendar");
  const result = await loadCalendarCatalog({ origin }, query);
  if (result.status !== "ready") throw new PublicCatalogUnavailableError("unexpected");
  return result;
}

/** Successful IPO detail + histories. Missing / failures throw and are not cached. */
export async function cachedDetailCatalog(origin: string, slug: string): Promise<ReadyDetailCatalog> {
  "use cache";
  cacheLife("ipoIssue");
  cacheTag("ipo-public", "ipo-issue", `ipo-issue:${slug}`);
  const result = await loadDetailCatalog(slug, { origin });
  if (result.status === "missing") throw new PublicCatalogMissingError();
  if (result.status !== "ready") throw new PublicCatalogUnavailableError("unexpected");
  return result;
}

/** Successful compare documents. Failures throw and are not cached. */
export async function cachedIpoDocuments(origin: string, slugs: readonly string[]): Promise<ReadyCompareDocuments> {
  "use cache";
  cacheLife("ipoIssue");
  cacheTag("ipo-public", "ipo-compare");
  const result = await loadIpoDocuments(slugs, { origin });
  if (result.status !== "ready") throw new PublicCatalogUnavailableError("unexpected");
  return result;
}

/** Successful search page with hydrated documents. Failures throw and are not cached. */
export async function cachedSearchCatalog(
  origin: string,
  query: string | SearchCatalogQuery,
): Promise<ReadySearchCatalog> {
  "use cache";
  cacheLife("ipoListings");
  cacheTag("ipo-public", "ipo-search");
  const result = await loadSearchCatalog(query, { origin });
  if (result.status === "short" || result.status === "invalid") {
    throw new PublicCatalogSearchRejectedError(result.status);
  }
  if (result.status !== "ready") throw new PublicCatalogUnavailableError("unexpected");
  return result;
}

/** Successful search summaries for pickers. Failures throw and are not cached. */
export async function cachedSearchSummaries(
  origin: string,
  query: string,
  options: SearchSummaryOptions = {},
): Promise<ReadySearchSummaries> {
  "use cache";
  cacheLife("ipoListings");
  cacheTag("ipo-public", "ipo-search");
  const result = await loadSearchSummaries(query, { origin }, options);
  if (result.status === "short" || result.status === "invalid") {
    throw new PublicCatalogSearchRejectedError(result.status);
  }
  if (result.status !== "ready") throw new PublicCatalogUnavailableError("unexpected");
  return result;
}

/** Successful sitemap slug list. Failures throw and are not cached. */
export async function cachedSitemapCatalog(origin: string): Promise<ReadySitemapCatalog> {
  "use cache";
  cacheLife("ipoListings");
  cacheTag("ipo-public", "ipo-sitemap");
  const result = await loadSitemapCatalog({ origin });
  if (result.status !== "ready") throw new PublicCatalogUnavailableError("unexpected");
  return result;
}

export type CachedPromotionsPayload = {
  managed: boolean;
  slides: unknown;
};

/** Successful promotions payload only. Transport failures throw and are not cached. */
export async function cachedPromotionsPayload(origin: string): Promise<CachedPromotionsPayload> {
  "use cache";
  cacheLife("ipoPromotions");
  cacheTag("ipo-public", "ipo-promotions");
  const response = await fetch(new URL("/api/v1/promotions", origin), {
    headers: { accept: "application/json", ...internalServiceHeaders() },
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(4_000),
  });
  if (response.status !== 200) throw new PublicCatalogUnavailableError("unexpected");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") throw new PublicCatalogUnavailableError("unexpected");
  const record = payload as { managed?: unknown; slides?: unknown };
  return { managed: record.managed === true, slides: record.slides };
}
