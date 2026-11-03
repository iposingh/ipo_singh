import type { Board, IpoStatus } from "@ipo-singh/contracts";
import {
  formatGmp,
  formatLastUpdated,
  formatSubscriptionMultiple,
  freshnessLabel,
  isPresentNumber,
  unofficialGmpDisclaimer,
} from "@ipo-singh/core";

export type BadgeTone = "neutral" | "positive" | "negative" | "warning";

export const noSampleDescription = "This list does not add a sample company or a GMP of ₹0.";

export function boardLabel(board: Board): string {
  return board === "mainboard" ? "Mainboard" : "SME";
}

export function statusLabel(status: IpoStatus | null): string {
  if (status === "upcoming") return "Upcoming";
  if (status === "open") return "Open";
  if (status === "closed") return "Closed";
  if (status === "allotment") return "Allotment";
  if (status === "listed") return "Listed";
  return "Status unavailable";
}

/**
 * List/card lifecycle label. Allotment Awaited and Allotment Out stay distinct.
 * A passed allotment date alone is not Allotment Out. Listed stays Listed.
 */
export function listingLifecycleLabel(input: {
  status: IpoStatus | null;
  allotmentConfirmed?: boolean | null;
}): string {
  if (input.status === "listed" || input.status === "open" || input.status === "upcoming") {
    return statusLabel(input.status);
  }
  if (input.allotmentConfirmed === true) return "Allotment Out";
  if (input.status === "allotment" || input.status === "closed") return "Allotment Awaited";
  return statusLabel(input.status);
}

/** Allotment section only. Independent of Open / Upcoming / Listed status. */
export function allotmentStatusLabel(allotmentConfirmed?: boolean | null): "Allotment Out" | "Allotment Awaited" {
  return allotmentConfirmed === true ? "Allotment Out" : "Allotment Awaited";
}

export function statusTone(status: IpoStatus | null): BadgeTone | null {
  if (status === "open" || status === "listed") return "positive";
  if (status === "upcoming" || status === "allotment") return "warning";
  if (status === "closed") return "neutral";
  return null;
}

export function listingLifecycleTone(input: {
  status: IpoStatus | null;
  allotmentConfirmed?: boolean | null;
}): BadgeTone | null {
  if (input.status === "listed" || input.status === "open" || input.status === "upcoming") {
    return statusTone(input.status);
  }
  if (input.allotmentConfirmed === true) return "positive";
  if (input.status === "allotment" || input.status === "closed") return "warning";
  return statusTone(input.status);
}

export function toneSymbol(tone: BadgeTone): string | null {
  if (tone === "positive") return "▲";
  if (tone === "negative") return "▼";
  if (tone === "warning") return "!";
  return null;
}

export function calendarEventLabel(event: "open" | "close" | "allotment" | "listing"): string {
  if (event === "open") return "Opens";
  if (event === "close") return "Closes";
  if (event === "allotment") return "Allotment";
  return "Listing";
}

const minimumSearchLength = 2;

export type SearchTextResult = { status: "empty" } | { status: "short" } | { status: "invalid" } | { status: "ready"; text: string };

export function prepareSearchText(value: string): SearchTextResult {
  const trimmed = value.trim().slice(0, 80);
  if (!trimmed) return { status: "empty" };
  if (trimmed.includes("<") || trimmed.includes(">")) return { status: "invalid" };
  for (const character of trimmed) {
    if ((character.codePointAt(0) ?? 0) <= 31) return { status: "invalid" };
  }
  if (trimmed.length < minimumSearchLength) return { status: "short" };
  return { status: "ready", text: trimmed };
}

export type GmpCopy = {
  value: string;
  tone: "neutral" | "positive" | "negative";
  freshness: string | null;
  disclaimer: string | null;
};

export function gmpIndicatorCopy(input: {
  gmpAmountRupees: number | null;
  percent?: number | null;
  freshness: "missing" | "fresh" | "stale";
}): GmpCopy {
  if (!isPresentNumber(input.gmpAmountRupees)) {
    return { value: "GMP unavailable", tone: "neutral", freshness: null, disclaimer: null };
  }
  const tone = input.gmpAmountRupees > 0 ? "positive" : input.gmpAmountRupees < 0 ? "negative" : "neutral";
  return {
    value: formatGmp(input.gmpAmountRupees, input.percent ?? null),
    tone,
    freshness: freshnessLabel(input.freshness),
    disclaimer: unofficialGmpDisclaimer,
  };
}

export function subscriptionIndicatorCopy(times: number | null): { value: string; missing: boolean } {
  if (!isPresentNumber(times)) return { value: "Subscription unavailable", missing: true };
  return { value: formatSubscriptionMultiple(times), missing: false };
}

export function dataFreshnessCopy(input: {
  retrievedAt: string | null;
  freshness: "missing" | "fresh" | "stale";
}): { freshness: string; updated: string } {
  return {
    freshness: freshnessLabel(input.freshness),
    updated: formatLastUpdated(input.retrievedAt ? new Date(input.retrievedAt) : null),
  };
}
