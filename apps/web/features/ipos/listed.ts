import type { Board, Ipo } from "@ipo-singh/contracts";
import { actualListingGainPercent, applicableIssuePriceRupees, isPresentNumber } from "@ipo-singh/core";
import type { SortDirection } from "./browse.ts";
import { parseListingPage } from "./listing-sections.ts";

export type ListedSort = "listing" | "gain" | "name" | "issue";
export type ListedBoard = "all" | Board;

export type ListedQuery = {
  q: string;
  board: ListedBoard;
  sort: ListedSort;
  direction: SortDirection;
  page: number;
};

/** Prices and the actual listing change. GMP is not read. */
export type ListingFacts = {
  issuePriceRupees: number | null;
  listingPriceRupees: number | null;
  gainPercent: number | null;
  listingDate: string | null;
  currentPriceRupees: number | null;
  sinceListingPercent: number | null;
};

const sorts: readonly ListedSort[] = ["listing", "gain", "name", "issue"];

function firstParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim();
}

export function parseListedQuery(params: {
  q?: string | string[];
  board?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
  page?: string | string[];
}): ListedQuery {
  const board = firstParam(params.board);
  const sort = firstParam(params.sort);
  return {
    q: firstParam(params.q).slice(0, 80),
    board: board === "mainboard" || board === "sme" ? board : "all",
    sort: sorts.includes(sort as ListedSort) ? (sort as ListedSort) : "listing",
    direction: firstParam(params.direction) === "asc" ? "asc" : "desc",
    page: parseListingPage(params.page),
  };
}

export function listedPath(query: ListedQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.board !== "all") params.set("board", query.board);
  if (query.sort !== "listing") params.set("sort", query.sort);
  if (query.direction !== "desc") params.set("direction", query.direction);
  if (query.page > 1) params.set("page", String(query.page));
  const text = params.toString();
  return text ? `/ipos/listed?${text}` : "/ipos/listed";
}

/**
 * Actual listing performance.
 * The issue price is the stored listing issue price, including zero, otherwise the applicable offer price.
 * The gain is calculated from those prices. A stored listing gain is used only when the prices cannot be calculated.
 * A missing price stays missing. GMP is not part of this result.
 */
export function actualListingPerformance(ipo: Ipo): ListingFacts {
  const listing = ipo.listing ?? null;
  const offerPrice = applicableIssuePriceRupees({
    issuePriceRupees: ipo.offer.issuePriceRupees,
    priceBandLowRupees: ipo.offer.priceBand.lowRupees,
    priceBandHighRupees: ipo.offer.priceBand.highRupees,
  });
  const issuePrice = isPresentNumber(listing?.issuePriceRupees)
    ? listing.issuePriceRupees
    : offerPrice.status === "value"
      ? offerPrice.value
      : null;
  const listingPrice = isPresentNumber(listing?.listingPriceRupees) ? listing.listingPriceRupees : null;
  const calculated = actualListingGainPercent({
    listingPriceRupees: listingPrice,
    issuePriceRupees: issuePrice,
  });
  const profile = ipo.profile ?? null;
  return {
    issuePriceRupees: issuePrice,
    listingPriceRupees: listingPrice,
    gainPercent: calculated.status === "value" ? calculated.value : isPresentNumber(listing?.gainPercent) ? listing.gainPercent : null,
    listingDate: ipo.dates.listingDate,
    currentPriceRupees: profile && isPresentNumber(profile.cmpRupees) ? profile.cmpRupees : null,
    sinceListingPercent: profile && isPresentNumber(profile.currentGainPercent) ? profile.currentGainPercent : null,
  };
}

function comparePresent(left: string | number | null, right: string | number | null, direction: SortDirection): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const delta = left < right ? -1 : left > right ? 1 : 0;
  return direction === "desc" ? -delta : delta;
}

function compareListed(left: Ipo, right: Ipo, query: ListedQuery): number {
  if (query.sort === "name") return comparePresent(left.companyName, right.companyName, query.direction);
  const leftFacts = actualListingPerformance(left);
  const rightFacts = actualListingPerformance(right);
  if (query.sort === "gain") return comparePresent(leftFacts.gainPercent, rightFacts.gainPercent, query.direction);
  if (query.sort === "issue") return comparePresent(leftFacts.issuePriceRupees, rightFacts.issuePriceRupees, query.direction);
  return comparePresent(leftFacts.listingDate, rightFacts.listingDate, query.direction);
}

export function arrangeListed(ipos: readonly Ipo[], query: ListedQuery): Ipo[] {
  const q = query.q.trim().toLowerCase();
  return ipos
    .filter((ipo) => ipo.status === "listed")
    .filter((ipo) => (query.board === "all" ? true : ipo.board === query.board))
    .filter((ipo) => (q ? ipo.companyName.toLowerCase().includes(q) : true))
    .slice()
    .sort((left, right) => {
      const order = compareListed(left, right, query);
      return order === 0 ? left.slug.localeCompare(right.slug) : order;
    });
}
