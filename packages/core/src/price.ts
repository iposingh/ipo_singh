import { isPresentNumber, roundTo, toPaise } from "./number.ts";
import { invalidResult, missingResult, valueResult, type CalculationResult } from "./result.ts";

function presentPrice(value: number | null | undefined): CalculationResult | number {
  if (value === null || value === undefined) return missingResult;
  if (!isPresentNumber(value)) return invalidResult("not-finite");
  if (value < 0) return invalidResult("negative-price");
  return value;
}

/**
 * Price used for GMP and lot investment.
 * A fixed issue price wins, including zero. Otherwise the top of the price band is used.
 */
export function applicableIssuePriceRupees(input: {
  issuePriceRupees?: number | null;
  priceBandLowRupees?: number | null;
  priceBandHighRupees?: number | null;
}): CalculationResult {
  const fixed = presentPrice(input.issuePriceRupees ?? null);
  if (typeof fixed === "number") return valueResult(fixed);
  if (fixed.status === "invalid") return fixed;
  if (input.issuePriceRupees === null || input.issuePriceRupees === undefined) {
    const low = input.priceBandLowRupees ?? null;
    const high = input.priceBandHighRupees ?? null;
    if (isPresentNumber(low) && isPresentNumber(high) && high < low) {
      return invalidResult("inverted-price-band");
    }
    const band = presentPrice(high);
    if (typeof band === "number") return valueResult(band);
    return band;
  }
  return fixed;
}

export function percentOfPrice(partRupees: number | null | undefined, baseRupees: number | null | undefined): CalculationResult {
  if (partRupees === null || partRupees === undefined || baseRupees === null || baseRupees === undefined) {
    return missingResult;
  }
  if (!isPresentNumber(partRupees) || !isPresentNumber(baseRupees)) return invalidResult("not-finite");
  if (baseRupees < 0) return invalidResult("negative-price");
  if (baseRupees === 0) return invalidResult("zero-base-price");
  const percent = (toPaise(partRupees) / toPaise(baseRupees)) * 100;
  return valueResult(roundTo(percent, 2));
}
