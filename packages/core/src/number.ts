export function isPresentNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export type ChangeDirection = "missing" | "positive" | "negative" | "flat";

export function changeDirection(value: number | null | undefined): ChangeDirection {
  if (!isPresentNumber(value)) {
    return "missing";
  }
  if (value > 0) {
    return "positive";
  }
  if (value < 0) {
    return "negative";
  }
  return "flat";
}

export function directionLabel(direction: ChangeDirection): string {
  switch (direction) {
    case "positive":
      return "Gain";
    case "negative":
      return "Loss";
    case "flat":
      return "No change";
    case "missing":
      return "Not available";
  }
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Whole paise, so rupee math does not keep binary fractions. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number): number {
  return paise / 100;
}
