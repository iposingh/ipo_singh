import type { Offer } from "@ipo-singh/contracts";
import {
  applicableIssuePriceRupees,
  formatInr,
  gmpPercent,
  indicativeGmpImpliedPrice,
  isIndicativeGmpPrice,
  isPresentNumber,
  minimumLotInvestmentRupees,
  resolveFreshness,
  type Freshness,
  type IndicativeGmpPrice,
} from "@ipo-singh/core";

/** Delayed only when the observation is strictly older than 24 hours. Exactly 24 hours stays current. */
export const gmpDisplayStaleAfterMs = 24 * 60 * 60 * 1000;

export function gmpDisplayFreshness(observedAt: string | null | undefined, now: Date): Freshness {
  if (!observedAt) return "missing";
  const stamp = new Date(observedAt);
  return resolveFreshness(Number.isNaN(stamp.getTime()) ? null : stamp, now, gmpDisplayStaleAfterMs);
}

export type GmpSummaryInput = {
  gmpAmountRupees: number | null | undefined;
  issuePriceRupees: number | null | undefined;
  priceBandLowRupees: number | null | undefined;
  priceBandHighRupees: number | null | undefined;
};

export type GmpSummary =
  | { available: false; text: "GMP unavailable" }
  | { available: true; amountText: string; percent: number | null };

export function summarizeGmp(input: GmpSummaryInput): GmpSummary {
  if (!isPresentNumber(input.gmpAmountRupees)) {
    return { available: false, text: "GMP unavailable" };
  }
  const price = applicableIssuePriceRupees(input);
  const percent =
    price.status === "value"
      ? gmpPercent({ gmpAmountRupees: input.gmpAmountRupees, issuePriceRupees: price.value })
      : null;
  return {
    available: true,
    amountText: formatInr(input.gmpAmountRupees),
    percent: percent?.status === "value" ? percent.value : null,
  };
}

export function impliedGmpPrice(input: GmpSummaryInput): IndicativeGmpPrice | null {
  if (!isPresentNumber(input.gmpAmountRupees)) return null;
  const price = applicableIssuePriceRupees(input);
  if (price.status !== "value") return null;
  const implied = indicativeGmpImpliedPrice({
    gmpAmountRupees: input.gmpAmountRupees,
    issuePriceRupees: price.value,
  });
  return isIndicativeGmpPrice(implied) ? implied : null;
}

export function minimumInvestmentAmount(offer: Offer) {
  const price = applicableIssuePriceRupees({
    issuePriceRupees: offer.issuePriceRupees,
    priceBandLowRupees: offer.priceBand.lowRupees,
    priceBandHighRupees: offer.priceBand.highRupees,
  });
  if (price.status !== "value") return price;
  return minimumLotInvestmentRupees(offer.lotSizeShares, price.value);
}
