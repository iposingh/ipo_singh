import { cache } from "react";
import { connection } from "next/server";
import type { Board, CalendarEntry, GmpHistoryWindow, GmpObservation, Ipo, SubscriptionSnapshot } from "@ipo-singh/contracts";
import { parseSearchRequestKey } from "@/features/search/query";
import { refreshIpoLifecycle, refreshSummaryLifecycle } from "@/features/ipos/lifecycle";
import {
  PublicCatalogMissingError,
  PublicCatalogSearchRejectedError,
  PublicCatalogUnavailableError,
  cachedCalendarCatalog,
  cachedDetailCatalog,
  cachedIpoDocuments,
  cachedListedCatalog,
  cachedListingSummaries,
  cachedSearchCatalog,
  cachedSearchSummaries,
  cachedSitemapCatalog,
} from "@/lib/api/public-catalog-cache";
import {
  inspectSearchQuery,
  ipoSinghApiOrigin,
  loadBoardCatalog,
  loadCalendarCatalog,
  loadDetailCatalog,
  loadIpoDocuments,
  loadListedCatalog,
  loadListingSummaries,
  loadSearchCatalog,
  loadSearchSummaries,
  loadSitemapCatalog,
  type CalendarCatalogResult,
  type CatalogResult,
  type CompareDocumentsResult,
  type ListedCatalogResult,
  type ListingPageResult,
  type ListingQuery,
  type SearchCatalogResult,
  type SearchSummaryResult,
  type SitemapCatalogResult,
} from "@/lib/api/ipo-singh";

export type IpoDetailModel = {
  ipo: Ipo;
  gmpHistory: readonly GmpObservation[];
  gmpSourceName: string | null;
  gmpHistoryRetrievedAt: string | null;
  gmpHistoryWindow: GmpHistoryWindow | null;
  gmpHistoryStatus: "ready" | "unavailable";
  subscriptionHistory: readonly SubscriptionSnapshot[];
  subscriptionSourceName: string | null;
  subscriptionHistoryRetrievedAt: string | null;
  subscriptionHistoryStatus: "ready" | "unavailable";
};

export type DetailResult =
  | { status: "ready"; detail: IpoDetailModel }
  | { status: "missing" }
  | { status: "unavailable" };

function configuredOrigin(): string | undefined {
  return process.env.IPO_SINGH_API_ORIGIN;
}

function publicOrigin(): string | null {
  return ipoSinghApiOrigin(configuredOrigin())?.origin ?? null;
}

function listingUnavailable(error: unknown): ListingPageResult {
  if (error instanceof PublicCatalogUnavailableError) {
    return { status: error.status, items: [], totalCount: null };
  }
  return { status: "unexpected", items: [], totalCount: null };
}

/** Stored Mainboard or SME issues from IPO Singh's API. An unreachable API is unavailable, not a sample list. */
export const loadBoardIpos = cache(async (board: Board): Promise<CatalogResult> => {
  await connection();
  const loaded = await loadBoardCatalog(board, { origin: configuredOrigin() });
  if (loaded.status !== "ready") return loaded;
  return { ...loaded, ipos: loaded.ipos.map((ipo) => refreshIpoLifecycle(ipo)) };
});

/**
 * One stored summary page. Uses the bounded public catalogue cache for successful reads.
 * Lifecycle status is refreshed at request time from IST calendar dates.
 */
export const loadListingPage = cache(async (query: ListingQuery): Promise<ListingPageResult> => {
  await connection();
  const origin = publicOrigin();
  if (!origin) return { status: "backend", items: [], totalCount: null };
  try {
    const loaded = await cachedListingSummaries(origin, query);
    return { status: "ready", items: loaded.items.map((item) => refreshSummaryLifecycle(item)), totalCount: loaded.totalCount };
  } catch (error) {
    if (error instanceof PublicCatalogUnavailableError) return listingUnavailable(error);
    const loaded = await loadListingSummaries(query, { origin: configuredOrigin() });
    if (loaded.status !== "ready") return loaded;
    return { ...loaded, items: loaded.items.map((item) => refreshSummaryLifecycle(item)) };
  }
});

export const loadIpoDetail = cache(async (slug: string): Promise<DetailResult> => {
  await connection();
  const origin = publicOrigin();
  if (!origin) return { status: "unavailable" };
  try {
    const loaded = await cachedDetailCatalog(origin, slug);
    const ipo = refreshIpoLifecycle(loaded.ipo);
    return {
      status: "ready",
      detail: {
        ipo,
        gmpHistory: loaded.gmpHistory,
        gmpSourceName: ipo.gmp ? (loaded.gmpSourceName ?? ipo.provenance.sourceName) : loaded.gmpSourceName,
        gmpHistoryRetrievedAt: loaded.gmpHistoryRetrievedAt,
        gmpHistoryWindow: loaded.gmpHistoryWindow ?? null,
        gmpHistoryStatus: loaded.gmpHistoryStatus,
        subscriptionHistory: loaded.subscriptionHistory,
        subscriptionSourceName: loaded.subscriptionSourceName,
        subscriptionHistoryRetrievedAt: loaded.subscriptionHistoryRetrievedAt,
        subscriptionHistoryStatus: loaded.subscriptionHistoryStatus,
      },
    };
  } catch (error) {
    if (error instanceof PublicCatalogMissingError) return { status: "missing" };
    if (error instanceof PublicCatalogUnavailableError) return { status: "unavailable" };
    const loaded = await loadDetailCatalog(slug, { origin: configuredOrigin() });
    if (loaded.status !== "ready") return loaded;
    const ipo = refreshIpoLifecycle(loaded.ipo);
    return {
      status: "ready",
      detail: {
        ipo,
        gmpHistory: loaded.gmpHistory,
        gmpSourceName: ipo.gmp ? (loaded.gmpSourceName ?? ipo.provenance.sourceName) : loaded.gmpSourceName,
        gmpHistoryRetrievedAt: loaded.gmpHistoryRetrievedAt,
        gmpHistoryWindow: loaded.gmpHistoryWindow ?? null,
        gmpHistoryStatus: loaded.gmpHistoryStatus,
        subscriptionHistory: loaded.subscriptionHistory,
        subscriptionSourceName: loaded.subscriptionSourceName,
        subscriptionHistoryRetrievedAt: loaded.subscriptionHistoryRetrievedAt,
        subscriptionHistoryStatus: loaded.subscriptionHistoryStatus,
      },
    };
  }
});

export const searchIpos = cache(async (key: string): Promise<SearchCatalogResult> => {
  await connection();
  const request = parseSearchRequestKey(key);
  if (!request) return { status: "invalid" };
  const origin = publicOrigin();
  if (!origin) return { status: "unavailable" };
  try {
    return await cachedSearchCatalog(origin, request);
  } catch (error) {
    if (error instanceof PublicCatalogSearchRejectedError) return { status: error.status };
    if (error instanceof PublicCatalogUnavailableError) return { status: "unavailable" };
    return loadSearchCatalog(request, { origin: configuredOrigin() });
  }
});

/** Picker results. The string key keeps one search read for the page and its metadata. */
export const searchCompareCandidates = cache(async (query: string): Promise<SearchSummaryResult> => {
  await connection();
  const prepared = inspectSearchQuery(query);
  if (!prepared.ok) return { status: prepared.status };
  const origin = publicOrigin();
  if (!origin) return { status: "unavailable" };
  try {
    return await cachedSearchSummaries(origin, prepared.query.q);
  } catch (error) {
    if (error instanceof PublicCatalogSearchRejectedError) return { status: error.status };
    if (error instanceof PublicCatalogUnavailableError) return { status: "unavailable" };
    return loadSearchSummaries(prepared.query.q, { origin: configuredOrigin() });
  }
});

/** Selected comparison issues. The comma-separated key deduplicates a repeated read of the same set. */
export const loadCompareIpos = cache(async (slugKey: string): Promise<CompareDocumentsResult> => {
  await connection();
  const slugs = slugKey.length > 0 ? slugKey.split(",") : [];
  const origin = publicOrigin();
  if (!origin) return { status: "unavailable" };
  try {
    return await cachedIpoDocuments(origin, slugs);
  } catch (error) {
    if (error instanceof PublicCatalogUnavailableError) return { status: "unavailable" };
    return loadIpoDocuments(slugs, { origin: configuredOrigin() });
  }
});

export const loadCalendar = cache(async (): Promise<CalendarCatalogResult> => {
  await connection();
  const origin = publicOrigin();
  if (!origin) return { status: "unavailable" };
  try {
    return await cachedCalendarCatalog(origin);
  } catch (error) {
    if (error instanceof PublicCatalogUnavailableError) return { status: "unavailable" };
    return loadCalendarCatalog({ origin: configuredOrigin() });
  }
});

/** One India calendar month. The API returns only dates it has stored in that range. */
export const loadCalendarMonth = cache(async (from: string, to: string, board: "all" | Board): Promise<CalendarCatalogResult> => {
  await connection();
  const origin = publicOrigin();
  if (!origin) return { status: "unavailable" };
  const query = { from, to, board: board === "all" ? undefined : board };
  try {
    return await cachedCalendarCatalog(origin, query);
  } catch (error) {
    if (error instanceof PublicCatalogUnavailableError) return { status: "unavailable" };
    return loadCalendarCatalog({ origin: configuredOrigin() }, query);
  }
});

/** Listed issue summaries with stored listing prices. Does not hydrate detail documents. */
export const loadListedIpos = cache(async (): Promise<ListedCatalogResult> => {
  await connection();
  const origin = publicOrigin();
  if (!origin) return { status: "unavailable" };
  try {
    return await cachedListedCatalog(origin);
  } catch (error) {
    if (error instanceof PublicCatalogUnavailableError) return { status: "unavailable" };
    return loadListedCatalog({ origin: configuredOrigin() });
  }
});

/** Sitemap slugs. One catalogue read, shared by a repeated call in the same render. */
export const loadSitemapIssues = cache(async (): Promise<SitemapCatalogResult> => {
  await connection();
  const origin = publicOrigin();
  if (!origin) return { status: "unavailable" };
  try {
    return await cachedSitemapCatalog(origin);
  } catch (error) {
    if (error instanceof PublicCatalogUnavailableError) return { status: "unavailable" };
    return loadSitemapCatalog({ origin: configuredOrigin() });
  }
});

export type { CalendarEntry };
