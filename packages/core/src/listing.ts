import { percentOfPrice } from "./price.ts";
import type { CalculationResult } from "./result.ts";

/** Actual change from the issue price to the traded listing price. This is not a GMP estimate. */
export function actualListingGainPercent(input: {
  listingPriceRupees: number | null | undefined;
  issuePriceRupees: number | null | undefined;
}): CalculationResult {
  const { listingPriceRupees, issuePriceRupees } = input;
  if (
    listingPriceRupees === null ||
    listingPriceRupees === undefined ||
    issuePriceRupees === null ||
    issuePriceRupees === undefined
  ) {
    return { status: "missing" };
  }
  return percentOfPrice(listingPriceRupees - issuePriceRupees, issuePriceRupees);
}
