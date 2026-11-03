import type { Board, Ipo, IpoStatus, IpoSummary } from "@ipo-singh/contracts";
import {
  applicableIssuePriceRupees,
  formatInr,
  formatIstDate,
  formatLastUpdated,
  formatPriceBand,
  gmpPercent,
  isPresentNumber,
  minimumLotInvestmentRupees,
} from "@ipo-singh/core";
import { boardLabel, gmpIndicatorCopy, listingLifecycleLabel, type GmpCopy } from "../design/copy.ts";

export type OfferFacts = {
  priceBand: string;
  lotSize: string;
  minimumInvestment: string;
  gmpAmount: number | null;
  gmpPercent: number | null;
  gmp: GmpCopy;
  gmpFreshness: "missing" | "fresh" | "stale";
  updated: string;
  updatedStale: boolean;
};

export type DetailState = "hidden" | "loading" | "ready" | "unavailable";

function indiaDate(label: string, value: string | null): string {
  const text = formatIstDate(value);
  return text === "Unavailable" ? `${label} unavailable` : `${label} ${text}`;
}

function observedAt(ipo: Ipo): Date | null {
  const stamps = [ipo.gmp?.observedAt, ipo.subscription?.observedAt].flatMap((value) => {
    if (!value) return [];
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? [] : [date];
  });
  return stamps.reduce<Date | null>((latest, date) => {
    if (!latest || date.getTime() > latest.getTime()) return date;
    return latest;
  }, null);
}

export function currentGmpPercent(ipo: Ipo): number | null {
  const stored = ipo.gmp?.percent;
  if (isPresentNumber(stored)) return stored;
  if (!ipo.gmp || !isPresentNumber(ipo.gmp.amountRupees)) return null;
  const price = applicableIssuePriceRupees({
    issuePriceRupees: ipo.offer.issuePriceRupees,
    priceBandLowRupees: ipo.offer.priceBand.lowRupees,
    priceBandHighRupees: ipo.offer.priceBand.highRupees,
  });
  if (price.status !== "value") return null;
  const percent = gmpPercent({ gmpAmountRupees: ipo.gmp.amountRupees, issuePriceRupees: price.value });
  return percent.status === "value" ? percent.value : null;
}

export function offerFacts(ipo: Ipo): OfferFacts {
  const band = formatPriceBand(ipo.offer.priceBand.lowRupees, ipo.offer.priceBand.highRupees);
  const price = applicableIssuePriceRupees({
    issuePriceRupees: ipo.offer.issuePriceRupees,
    priceBandLowRupees: ipo.offer.priceBand.lowRupees,
    priceBandHighRupees: ipo.offer.priceBand.highRupees,
  });
  const investment = price.status === "value" ? minimumLotInvestmentRupees(ipo.offer.lotSizeShares, price.value) : price;
  const amount = ipo.gmp?.amountRupees ?? null;
  const percent = currentGmpPercent(ipo);
  const gmpFreshness = ipo.gmp?.freshness ?? "missing";
  return {
    priceBand: band === "Unavailable" ? "Unavailable" : band,
    lotSize: isPresentNumber(ipo.offer.lotSizeShares)
      ? `${new Intl.NumberFormat("en-IN").format(ipo.offer.lotSizeShares)} shares`
      : "Unavailable",
    minimumInvestment: investment.status === "value" ? formatInr(investment.value) : "Unavailable",
    gmpAmount: amount,
    gmpPercent: percent,
    gmp: gmpIndicatorCopy({ gmpAmountRupees: amount, percent, freshness: gmpFreshness }),
    gmpFreshness,
    updated: formatLastUpdated(observedAt(ipo)),
    updatedStale: ipo.gmp?.freshness === "stale" || ipo.subscription?.freshness === "stale",
  };
}

export function summaryFromIpo(ipo: Ipo): IpoSummary {
  return {
    id: ipo.id,
    slug: ipo.slug,
    companyName: ipo.companyName,
    board: ipo.board,
    status: ipo.status,
    openDate: ipo.dates.openDate,
    closeDate: ipo.dates.closeDate,
    gmpAmountRupees: ipo.gmp?.amountRupees ?? null,
    subscriptionTotalTimes: ipo.subscription?.totalTimes ?? null,
    provenance: ipo.provenance,
  };
}

function labeled(label: string, value: string): string {
  return value.toLowerCase().includes(label.toLowerCase()) ? value : `${label} ${value}`;
}

export function listingCardLabel(input: {
  companyName: string;
  board: Board;
  status: IpoStatus | null;
  openDate: string | null;
  closeDate: string | null;
  facts: OfferFacts | null;
  detailState: DetailState;
  allotmentConfirmed?: boolean | null;
}): string {
  const parts = [
    input.companyName,
    boardLabel(input.board),
    listingLifecycleLabel({ status: input.status, allotmentConfirmed: input.allotmentConfirmed }),
    indiaDate("Opens", input.openDate),
    indiaDate("Closes", input.closeDate),
  ];
  if (input.detailState === "loading") parts.push("Issue details are loading.");
  if (input.detailState === "unavailable") parts.push("Issue details could not be loaded.");
  if (input.facts) {
    parts.push(labeled("Price band", input.facts.priceBand));
    parts.push(labeled("Lot size", input.facts.lotSize));
    parts.push(labeled("Minimum investment", input.facts.minimumInvestment));
    parts.push(input.facts.updated);
  }
  parts.push("Shows the stored IPO.");
  return parts.join(". ");
}
