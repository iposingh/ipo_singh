import { isIsoDate } from "./dates.ts";

export function formatIstDateTime(value: Date | null | undefined): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "Unavailable";
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(value);

  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";

  const dayPeriod = part("dayPeriod").toUpperCase();
  return `${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} ${dayPeriod} IST`;
}

export function formatLastUpdated(value: Date | null | undefined): string {
  const when = formatIstDateTime(value);
  return when === "Unavailable" ? "Last updated: Unavailable" : `Last updated: ${when}`;
}

/** India calendar date for an instant. Returns null when the instant is missing. */
export function istCalendarDate(value: Date | null | undefined): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  return isIsoDate(formatted) ? formatted : null;
}

/**
 * UTC instant of 00:00 Asia/Kolkata on a published calendar date.
 * India has no daylight-saving shift, so the offset is +05:30 all year.
 * This anchor orders a date-only series. It is not a capture time.
 */
export function istDateAnchor(isoDate: string | null | undefined): Date | null {
  if (!isoDate || !isIsoDate(isoDate)) return null;
  const instant = new Date(`${isoDate}T00:00:00+05:30`);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/**
 * Parse `YYYY-MM-DD HH:mm:ss` as Asia/Kolkata civil time and return the UTC instant.
 * IPO Guru prints `recorded_at` in this shape beside an IST slot and does not print an offset.
 */
export function istCivilDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const isoDate = match[1] ?? "";
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  if (!isIsoDate(isoDate) || hour > 23 || minute > 59 || second > 59) return null;
  const instant = new Date(`${isoDate}T${match[2]}:${match[3]}:${match[4]}+05:30`);
  if (Number.isNaN(instant.getTime()) || istCalendarDate(instant) !== isoDate) return null;
  return instant;
}

/** Format a YYYY-MM-DD India date without shifting it through UTC midnight. */
export function formatIstDate(isoDate: string | null | undefined): string {
  if (!isoDate || !isIsoDate(isoDate)) {
    return "Unavailable";
  }
  const [year, month, day] = isoDate.split("-").map(Number);
  const instant = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 6, 30));
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}`;
}
