import { cache } from "react";
import { connection } from "next/server";
import type { Board, CalendarEntry, GmpHistoryWindow, GmpObservation, Ipo, SubscriptionSnapshot } from "@ipo-singh/contracts";
import { parseSearchRequestKey } from "@/features/search/query";
import { refreshIpoLifecycle, refreshSummaryLifecycle } from "@/features/ipos/lifecycle";
import { loadBoardCatalog, loadCalendarCatalog, loadDetailCatalog, loadIpoDocuments, loadListedCatalog, loadListingSummaries, loadSearchCatalog, loadSearchSummaries, loadSitemapCatalog, type CalendarCatalogResult, type CatalogResult, type CompareDocumentsResult, type ListedCatalogResult, type ListingPageResult, type ListingQuery, type SearchCatalogResult, type SearchSummaryResult, type SitemapCatalogResult } from "@/lib/api/ipo-singh";

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

function origin(): string | undefined {
  return process.env.IPO_SINGH_API_ORIGIN;
}

/** Stored Mainboard or SME issues from IPO Singh's API. An unreachable API is unavailable, not a sample list. */
export const loadBoardIpos = cache(async (board: Board): Promise<CatalogResult> => {
  await connection();
  const loaded = await loadBoardCatalog(board, { origin: origin() });
  if (loaded.status !== "ready") return loaded;
  return { ...loaded, ipos: loaded.ipos.map((ipo) => refreshIpoLifecycle(ipo)) };
});

/** One stored summary page. The board list does not request an IPO detail document per card. */
export const loadListingPage = cache(async (query: ListingQuery): Promise<ListingPageResult> => {
  await connection();
  const loaded = await loadListingSummaries(query, { origin: origin() });
  if (loaded.status !== "ready") return loaded;
  return { ...loaded, items: loaded.items.map((item) => refreshSummaryLifecycle(item)) };
});

export const loadIpoDetail = cache(async (slug: string): Promise<DetailResult> => {
  await connection();
  const loaded = await loadDetailCatalog(slug, { origin: origin() });
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
});

export const searchIpos = cache(async (key: string): Promise<SearchCatalogResult> => {
  await connection();
  const request = parseSearchRequestKey(key);
  if (!request) return { status: "invalid" };
  return loadSearchCatalog(request, { origin: origin() });
});

/** Picker results. The string key keeps one search read for the page and its metadata. */
export const searchCompareCandidates = cache(async (query: string): Promise<SearchSummaryResult> => {
  await connection();
  return loadSearchSummaries(query, { origin: origin() });
});

/** Selected comparison issues. The comma-separated key deduplicates a repeated read of the same set. */
export const loadCompareIpos = cache(async (slugKey: string): Promise<CompareDocumentsResult> => {
  await connection();
  const slugs = slugKey.length > 0 ? slugKey.split(",") : [];
  return loadIpoDocuments(slugs, { origin: origin() });
});

export const loadCalendar = cache(async (): Promise<CalendarCatalogResult> => {
  await connection();
  return loadCalendarCatalog({ origin: origin() });
});

/** One India calendar month. The API returns only dates it has stored in that range. */
export const loadCalendarMonth = cache(async (from: string, to: string, board: "all" | Board): Promise<CalendarCatalogResult> => {
  await connection();
  return loadCalendarCatalog(
    { origin: origin() },
    { from, to, board: board === "all" ? undefined : board },
  );
});

/** Listed issues with their stored prices. An empty catalogue stays empty. */
export const loadListedIpos = cache(async (): Promise<ListedCatalogResult> => {
  await connection();
  return loadListedCatalog({ origin: origin() });
});

/** Sitemap slugs. One catalogue read, shared by a repeated call in the same render. */
export const loadSitemapIssues = cache(async (): Promise<SitemapCatalogResult> => {
  await connection();
  return loadSitemapCatalog({ origin: origin() });
});

export type { CalendarEntry };
