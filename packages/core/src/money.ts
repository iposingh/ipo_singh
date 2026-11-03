import { isPresentNumber } from "./number.ts";

const unavailable = "Unavailable";
const lakhRupees = 100_000;
const croreRupees = 10_000_000;

export function formatInr(amount: number | null | undefined): string {
  if (!isPresentNumber(amount)) {
    return unavailable;
  }
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

function formatScaleNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Rupees below one lakh, then lakh, then crore. The unit word is part of the text. */
export function formatInrScale(amount: number | null | undefined): string {
  if (!isPresentNumber(amount)) {
    return unavailable;
  }
  const absolute = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (absolute >= croreRupees || Math.round((absolute / lakhRupees) * 100) / 100 >= 100) {
    return `${sign}₹${formatScaleNumber(absolute / croreRupees)} crore`;
  }
  if (absolute >= lakhRupees) {
    return `${sign}₹${formatScaleNumber(absolute / lakhRupees)} lakh`;
  }
  return formatInr(amount);
}

export function formatSignedPercent(value: number | null | undefined): string {
  if (!isPresentNumber(value)) {
    return unavailable;
  }
  const absolute = Math.abs(value).toFixed(2);
  if (value > 0) {
    return `+${absolute}%`;
  }
  if (value < 0) {
    return `−${absolute}%`;
  }
  return `${absolute}%`;
}

export function formatGmp(
  amountRupees: number | null | undefined,
  percent: number | null | undefined,
): string {
  const amountText = formatInr(amountRupees);
  const percentText = formatSignedPercent(percent);
  if (amountText === unavailable && percentText === unavailable) {
    return unavailable;
  }
  if (percentText === unavailable) {
    return `${amountText} (percent unavailable)`;
  }
  if (amountText === unavailable) {
    return `Amount unavailable (${percentText})`;
  }
  return `${amountText} (${percentText})`;
}

export function formatSubscriptionMultiple(value: number | null | undefined): string {
  if (!isPresentNumber(value)) {
    return unavailable;
  }
  const text = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
  return `${text}x`;
}

export function formatPriceBand(
  lowRupees: number | null | undefined,
  highRupees: number | null | undefined,
): string {
  if (!isPresentNumber(lowRupees) || !isPresentNumber(highRupees)) {
    return unavailable;
  }
  return `${formatInr(lowRupees)}–${formatInr(highRupees)}`;
}
