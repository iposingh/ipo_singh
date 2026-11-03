import { isListingOverview, parseListingPage } from "../../features/ipos/listing-sections.ts";
import { listedPath, type ListedQuery } from "../../features/ipos/listed.ts";
import type { IpoBrowseQuery } from "../../features/ipos/browse.ts";

export function browseIsIndexable(query: IpoBrowseQuery, page: number): boolean {
  return isListingOverview(query) && page === 1;
}

export function listedIsIndexable(query: ListedQuery): boolean {
  return listedPath(query) === "/ipos/listed";
}

export function calendarIsIndexable(params: {
  month?: string | string[];
  view?: string | string[];
  board?: string | string[];
  event?: string | string[];
  day?: string | string[];
}): boolean {
  return !hasParam(params.month) && !hasParam(params.view) && !hasParam(params.board) && !hasParam(params.event) && !hasParam(params.day);
}

export function compareIsIndexable(selection: { slugs: readonly string[]; q: string }): boolean {
  return selection.slugs.length === 0 && selection.q.trim() === "";
}

/** Allotment landing stays indexable; board filters keep the clean canonical and stay noindex. */
export function allotmentIsIndexable(board: string | undefined): boolean {
  return board !== "mainboard" && board !== "sme";
}

export function listingPageFromParams(page: string | string[] | undefined): number {
  return parseListingPage(page);
}

function hasParam(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim() !== "";
}
