import { fromPaise, isPresentNumber, toPaise } from "./number.ts";
import { percentOfPrice } from "./price.ts";
import { invalidResult, missingResult, valueResult, type CalculationResult } from "./result.ts";

export const indicativeGmpPriceKind = "indicative-gmp-implied-price";

export const indicativeGmpDisclaimer =
  "Indicative only. A GMP-implied price is not a guaranteed listing price.";

export const unofficialGmpDisclaimer =
  "Grey Market Premium (GMP) is an unofficial market indicator and is not published by stock exchanges. Estimated listing values are illustrative, may change, and should not be considered a forecast or investment recommendation.";

/** Display label used wherever a GMP figure appears. */
export const gmpStarLabel = "GMP*";

export type IndicativeGmpPrice = {
  status: "value";
  kind: typeof indicativeGmpPriceKind;
  rupees: number;
  disclaimer: typeof indicativeGmpDisclaimer;
};

/** GMP amount divided by the applicable issue price. A negative amount is a discount, not missing data. */
export function gmpPercent(input: {
  gmpAmountRupees: number | null | undefined;
  issuePriceRupees: number | null | undefined;
}): CalculationResult {
  return percentOfPrice(input.gmpAmountRupees, input.issuePriceRupees);
}

/** Issue price plus GMP. The result is indicative and is not a listing prediction. */
export function indicativeGmpImpliedPrice(input: {
  gmpAmountRupees: number | null | undefined;
  issuePriceRupees: number | null | undefined;
}): CalculationResult | IndicativeGmpPrice {
  const { gmpAmountRupees, issuePriceRupees } = input;
  if (gmpAmountRupees === null || gmpAmountRupees === undefined || issuePriceRupees === null || issuePriceRupees === undefined) {
    return missingResult;
  }
  if (!isPresentNumber(gmpAmountRupees) || !isPresentNumber(issuePriceRupees)) return invalidResult("not-finite");
  if (issuePriceRupees < 0) return invalidResult("negative-price");
  const rupees = fromPaise(toPaise(issuePriceRupees) + toPaise(gmpAmountRupees));
  if (rupees < 0) return invalidResult("negative-implied-price");
  return {
    status: "value",
    kind: indicativeGmpPriceKind,
    rupees,
    disclaimer: indicativeGmpDisclaimer,
  };
}

export function isIndicativeGmpPrice(result: CalculationResult | IndicativeGmpPrice): result is IndicativeGmpPrice {
  return result.status === "value" && "kind" in result && result.kind === indicativeGmpPriceKind;
}
