import type { IpoSummary } from "@ipo-singh/contracts";
import { actualListingGainPercent, applicableIssuePriceRupees, isPresentNumber } from "@ipo-singh/core";

export type ListingReturn = {
  issuePriceRupees: number | null;
  listingPriceRupees: number | null;
  gainRupees: number | null;
  gainPercent: number | null;
};

/** Listing gain uses the actual listing price and the final issue price. GMP is not a substitute. */
export function listingReturn(ipo: Pick<
  IpoSummary,
  "issuePriceRupees" | "priceBandLowRupees" | "priceBandHighRupees" | "listingIssuePriceRupees" | "listingPriceRupees"
>): ListingReturn {
  const offer = applicableIssuePriceRupees({
    issuePriceRupees: ipo.issuePriceRupees ?? null,
    priceBandLowRupees: ipo.priceBandLowRupees ?? null,
    priceBandHighRupees: ipo.priceBandHighRupees ?? null,
  });
  const issuePriceRupees = isPresentNumber(ipo.listingIssuePriceRupees)
    ? ipo.listingIssuePriceRupees
    : offer.status === "value"
      ? offer.value
      : null;
  const listingPriceRupees = isPresentNumber(ipo.listingPriceRupees) ? ipo.listingPriceRupees : null;
  const percent = actualListingGainPercent({ listingPriceRupees, issuePriceRupees });
  const gainPercent = percent.status === "value" ? percent.value : null;
  return {
    issuePriceRupees,
    listingPriceRupees,
    gainRupees: gainPercent !== null && issuePriceRupees !== null && listingPriceRupees !== null ? listingPriceRupees - issuePriceRupees : null,
    gainPercent,
  };
}
