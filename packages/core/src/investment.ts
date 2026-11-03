import { fromPaise, isPresentNumber, toPaise } from "./number.ts";
import { invalidResult, missingResult, valueResult, type CalculationResult } from "./result.ts";

function wholeQuantity(value: number | null | undefined): CalculationResult | number {
  if (value === null || value === undefined) return missingResult;
  if (!isPresentNumber(value)) return invalidResult("not-finite");
  if (!Number.isInteger(value)) return invalidResult("fractional-quantity");
  if (value < 0) return invalidResult("negative-quantity");
  return value;
}

export function minimumLotInvestmentRupees(
  lotSizeShares: number | null | undefined,
  issuePriceRupees: number | null | undefined,
): CalculationResult {
  const shares = wholeQuantity(lotSizeShares);
  if (typeof shares !== "number") return shares;
  if (issuePriceRupees === null || issuePriceRupees === undefined) return missingResult;
  if (!isPresentNumber(issuePriceRupees)) return invalidResult("not-finite");
  if (issuePriceRupees < 0) return invalidResult("negative-price");
  return valueResult(fromPaise(toPaise(issuePriceRupees) * shares));
}

export function investmentForLots(
  perLotRupees: number | null | undefined,
  lotCount: number | null | undefined,
): CalculationResult {
  const lots = wholeQuantity(lotCount);
  if (typeof lots !== "number") return lots;
  if (perLotRupees === null || perLotRupees === undefined) return missingResult;
  if (!isPresentNumber(perLotRupees)) return invalidResult("not-finite");
  if (perLotRupees < 0) return invalidResult("negative-price");
  return valueResult(fromPaise(toPaise(perLotRupees) * lots));
}
