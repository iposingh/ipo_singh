export type InvalidReason =
  | "not-finite"
  | "negative-price"
  | "zero-base-price"
  | "negative-implied-price"
  | "negative-quantity"
  | "fractional-quantity"
  | "inverted-price-band";

export type CalculationResult =
  | { status: "value"; value: number }
  | { status: "missing" }
  | { status: "invalid"; reason: InvalidReason };

export const missingResult = { status: "missing" } as const;

export function valueResult(value: number): CalculationResult {
  return { status: "value", value };
}

export function invalidResult(reason: InvalidReason): CalculationResult {
  return { status: "invalid", reason };
}
