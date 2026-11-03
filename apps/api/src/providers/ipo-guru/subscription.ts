import type { SubscriptionCategory, SubscriptionSnapshot, SubscriptionSubcategory } from "@ipo-singh/contracts";
import { isIsoDate, istCalendarDate, istCivilDateTime } from "@ipo-singh/core";
import { recordValidationFailure } from "../../ops/validation.ts";

export type MappedSubscription = {
  observations: SubscriptionSnapshot[];
};

const parentFields = {
  TOTAL: "totalTimes",
  RETAIL: "retailTimes",
  QIB: "qibTimes",
  NII: "niiTimes",
  EMPLOYEE: "employeeTimes",
  SHAREHOLDER: "shareholderTimes",
  ANCHOR: "anchorTimes",
} as const;

const subcategoryKeys = new Set([
  "FII",
  "DFI",
  "MF",
  "OTHERS",
  "BNII",
  "BNII_CORP",
  "BNII_IND",
  "BNII_OTHERS",
  "SNII",
  "SNII_CORP",
  "SNII_IND",
  "SNII_OTHERS",
  "CUTOFF",
  "PRICE",
]);

type ParentField = (typeof parentFields)[keyof typeof parentFields];

type TimesRead = { present: boolean; times: number | null };

/**
 * Maps one `GET /ipos/{slug}/subscription` document.
 * `times_value` wins over the display string. An empty string with a null `times_value` stays unavailable.
 * `"0"` and `0` stay 0x. Subcategory multiples are not added into the parent.
 * Returns null when the payload is not a subscription document.
 */
export function mapCurrentSubscription(payload: unknown): MappedSubscription | null {
  if (!isRecord(payload) || !isRecord(payload.summary)) {
    recordValidationFailure();
    return null;
  }
  const summary = payload.summary;
  const observedAt = utcTimestamp(summary.updated_at);
  if (!observedAt) {
    recordValidationFailure();
    return null;
  }
  const flat = blankFlat();
  const present = new Set<string>();
  for (const [key, field] of Object.entries(parentFields) as [string, ParentField][]) {
    const read = readSummaryTimes(summary, summaryKey(key));
    if (!read.present) continue;
    present.add(key);
    flat[field] = read.times;
  }
  const categories = readCategories(payload.categories, flat, present);
  for (const [key, field] of Object.entries(parentFields) as [string, ParentField][]) {
    if (!present.has(key) || categories.some((category) => category.key === key)) continue;
    categories.push({ key, times: flat[field], subcategories: [] });
  }
  return {
    observations: [
      snapshot({
        ...flat,
        categories,
        observedAt: observedAt.toISOString(),
        observedOn: istCalendarDate(observedAt),
        biddingDay: null,
      }),
    ],
  };
}

/**
 * Maps one `GET /ipos/{slug}/subscription/history` document.
 * `date` plus `time` is Asia/Kolkata civil time. A null `time` does not become midnight.
 * Missing days are omitted. Returns null when the payload is not a history document.
 */
export function mapSubscriptionHistory(payload: unknown): MappedSubscription | null {
  if (!isRecord(payload) || !Array.isArray(payload.day_wise)) {
    recordValidationFailure();
    return null;
  }
  if (typeof payload.count === "number" && payload.count !== payload.day_wise.length) recordValidationFailure();
  const byDate = new Map<string, SubscriptionSnapshot>();
  for (const row of payload.day_wise) {
    const point = historyPoint(row);
    if (!point?.observedOn) continue;
    if (byDate.has(point.observedOn)) recordValidationFailure();
    byDate.set(point.observedOn, point);
  }
  return { observations: [...byDate.values()] };
}

function historyPoint(row: unknown): SubscriptionSnapshot | null {
  if (!isRecord(row) || typeof row.date !== "string" || !isIsoDate(row.date)) {
    recordValidationFailure();
    return null;
  }
  const flat = blankFlat();
  const categories: SubscriptionCategory[] = [];
  for (const [key, field] of Object.entries(parentFields) as [string, ParentField][]) {
    if (!(summaryKey(key) in row)) continue;
    const read = readLooseTimes(row[summaryKey(key)]);
    flat[field] = read.times;
    categories.push({ key, times: read.times, subcategories: [] });
  }
  const clock = typeof row.time === "string" && row.time.trim() !== "" ? istCivilDateTime(`${row.date} ${row.time.trim()}`) : null;
  if (row.time !== null && row.time !== undefined && clock === null) recordValidationFailure();
  return snapshot({
    ...flat,
    categories,
    observedAt: clock ? clock.toISOString() : null,
    observedOn: row.date,
    biddingDay: biddingDay(row.day),
  });
}

function readCategories(value: unknown, flat: FlatTimes, present: Set<string>): SubscriptionCategory[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    recordValidationFailure();
    return [];
  }
  const categories: SubscriptionCategory[] = [];
  for (const row of value) {
    if (!isRecord(row) || typeof row.key !== "string") {
      recordValidationFailure();
      continue;
    }
    const key = row.key;
    const read = readCategoryTimes(row);
    if (key in parentFields) {
      const field = parentFields[key as keyof typeof parentFields];
      if (present.has(key) && flat[field] !== null && read.times !== null && Math.abs((flat[field] ?? 0) - read.times) > 0.005) {
        recordValidationFailure();
      }
      flat[field] = read.times;
      present.add(key);
      categories.push({ key, times: read.times, subcategories: readSubcategories(row.sub_categories) });
      continue;
    }
    if (subcategoryKeys.has(key)) {
      categories.push({ key, times: read.times, subcategories: readSubcategories(row.sub_categories) });
      continue;
    }
    recordValidationFailure();
  }
  return categories;
}

function readSubcategories(value: unknown): SubscriptionSubcategory[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    recordValidationFailure();
    return [];
  }
  const rows: SubscriptionSubcategory[] = [];
  for (const row of value) {
    if (!isRecord(row) || typeof row.key !== "string" || !subcategoryKeys.has(row.key)) {
      recordValidationFailure();
      continue;
    }
    rows.push({ key: row.key, times: readCategoryTimes(row).times });
  }
  return rows;
}

function readCategoryTimes(row: Record<string, unknown>): TimesRead {
  if ("times_value" in row) {
    return { present: true, times: finiteTimes(row.times_value) };
  }
  return readLooseTimes(row.times);
}

function readSummaryTimes(summary: Record<string, unknown>, key: string): TimesRead {
  if (!(key in summary)) return { present: false, times: null };
  return readLooseTimes(summary[key]);
}

function readLooseTimes(value: unknown): TimesRead {
  if (value === undefined) return { present: false, times: null };
  return { present: true, times: finiteTimes(value) };
}

function finiteTimes(value: unknown): number | null {
  if (value === null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      recordValidationFailure();
      return null;
    }
    return value;
  }
  if (typeof value !== "string") {
    recordValidationFailure();
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    recordValidationFailure();
    return null;
  }
  return Number(trimmed);
}

function biddingDay(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  recordValidationFailure();
  return null;
}

function utcTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?Z$/.exec(value);
  if (!match) return null;
  const fraction = match[2] ? match[2].slice(0, 4) : "";
  const instant = new Date(`${match[1]}${fraction}Z`);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

function summaryKey(key: string): string {
  return key.toLowerCase();
}

type FlatTimes = {
  retailTimes: number | null;
  qibTimes: number | null;
  niiTimes: number | null;
  employeeTimes: number | null;
  shareholderTimes: number | null;
  anchorTimes: number | null;
  totalTimes: number | null;
};

function blankFlat(): FlatTimes {
  return {
    retailTimes: null,
    qibTimes: null,
    niiTimes: null,
    employeeTimes: null,
    shareholderTimes: null,
    anchorTimes: null,
    totalTimes: null,
  };
}

function snapshot(input: FlatTimes & {
  categories: SubscriptionCategory[];
  observedAt: string | null;
  observedOn: string | null;
  biddingDay: number | null;
}): SubscriptionSnapshot {
  return {
    retailTimes: input.retailTimes,
    qibTimes: input.qibTimes,
    niiTimes: input.niiTimes,
    employeeTimes: input.employeeTimes,
    shareholderTimes: input.shareholderTimes,
    anchorTimes: input.anchorTimes,
    categories: input.categories,
    totalTimes: input.totalTimes,
    observedAt: input.observedAt,
    observedOn: input.observedOn,
    biddingDay: input.biddingDay,
    freshness: "fresh",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
