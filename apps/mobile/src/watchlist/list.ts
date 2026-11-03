import {
  ipoSummarySchema,
  stableIdSchema,
  watchlistItemSchema,
  type Ipo,
  type IpoSummary,
  type WatchlistItem,
} from "@ipo-singh/contracts";

export const watchlistCollectionPath = "/api/v1/watchlist";

export type WatchlistBoard = "all" | "mainboard" | "sme";

export function watchlistItemPath(ipoId: string): string | null {
  const parsed = stableIdSchema.safeParse(ipoId);
  if (!parsed.success) return null;
  return `${watchlistCollectionPath}/${parsed.data}`;
}

export function dedupeWatchlist(items: readonly WatchlistItem[]): WatchlistItem[] {
  const seen = new Set<string>();
  const unique: WatchlistItem[] = [];
  for (const item of items) {
    if (seen.has(item.ipoId)) continue;
    seen.add(item.ipoId);
    unique.push(item);
  }
  return unique;
}

export function addWatchItem(items: readonly WatchlistItem[], item: WatchlistItem): WatchlistItem[] {
  return dedupeWatchlist([item, ...items.filter((entry) => entry.ipoId !== item.ipoId)]);
}

export function removeWatchItem(items: readonly WatchlistItem[], ipoId: string): WatchlistItem[] {
  return items.filter((item) => item.ipoId !== ipoId);
}

export function visibleWatchlist(items: readonly WatchlistItem[], board: WatchlistBoard): WatchlistItem[] {
  const unique = dedupeWatchlist(items);
  if (board === "all") return unique;
  return unique.filter((item) => item.ipo?.board === board);
}

export function provisionalWatchItem(ipo: IpoSummary, now: Date): WatchlistItem | null {
  const parsed = watchlistItemSchema.safeParse({
    ipoId: ipo.id,
    addedAt: now.toISOString(),
    note: null,
    availability: "available",
    ipo,
  });
  return parsed.success ? parsed.data : null;
}

/** Catalogue fields already on the IPO page. Missing GMP and subscription stay missing. */
export function summaryFromDetail(ipo: Ipo): IpoSummary | null {
  const parsed = ipoSummarySchema.safeParse({
    id: ipo.id,
    slug: ipo.slug,
    companyName: ipo.companyName,
    board: ipo.board,
    status: ipo.status,
    openDate: ipo.dates.openDate,
    closeDate: ipo.dates.closeDate,
    gmpAmountRupees: ipo.gmp === null ? null : ipo.gmp.amountRupees,
    subscriptionTotalTimes: ipo.subscription === null ? null : ipo.subscription.totalTimes,
    provenance: ipo.provenance,
    allotmentDate: ipo.dates.allotmentDate,
    listingDate: ipo.dates.listingDate,
    registrarName: ipo.registrar?.name ?? null,
    allotmentUrl: ipo.registrar?.allotmentUrl ?? null,
    ...(ipo.allotmentConfirmed === true ? { allotmentConfirmed: true as const } : {}),
  });
  return parsed.success ? parsed.data : null;
}

export function watchlistStatusMessage(
  status: "ready" | "offline" | "signed-out" | "rejected" | "limited" | "unavailable",
  action: "load" | "change",
  message?: string,
): string | null {
  if (status === "ready") return null;
  if (status === "offline") {
    return action === "load"
      ? "The watchlist could not be loaded while offline."
      : "The watchlist could not be changed while offline.";
  }
  if (status === "signed-out") return "Sign in to save this IPO.";
  return message ?? "The watchlist could not be updated.";
}
