import { recordValidationFailure } from "../../ops/validation.ts";

export type OfsCategory = "retail" | "non-retail" | "other";

/** Live bid snapshot. These figures are not IPO subscription multiples. */
export type OfsBook = {
  observedAt: string | null;
  offerDateText: string | null;
  updatedLabel: string | null;
  floorPriceRupees: number | null;
  indicativePriceRupees: number | null;
  lastTradedPriceRupees: number | null;
  subscriptionTimes: number | null;
  greenShoeSubscriptionTimes: number | null;
  totalQuantity: number | null;
  status: string | null;
};

/**
 * One offer for sale. It is not a Mainboard or SME IPO.
 * Dates stay timestamps when the provider sends an ISO instant.
 */
export type OfsIssue = {
  slug: string;
  companyName: string;
  shortName: string | null;
  category: OfsCategory;
  status: string | null;
  openAt: string | null;
  closeAt: string | null;
  floorPriceRupees: number | null;
  discountRupees: number | null;
  nseSymbol: string | null;
  bseScripCode: string | null;
  subscriptionTimes: number | null;
  seller: string | null;
  sharesOffered: number | null;
  greenShoeShares: number | null;
  book: OfsBook | null;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Maps one OFS list row or detail document. Returns null when the slug or company name is missing. */
export function mapOfsIssue(payload: unknown): OfsIssue | null {
  if (!isRecord(payload) || typeof payload.slug !== "string" || !slugPattern.test(payload.slug) || payload.slug.length > 80) {
    recordValidationFailure();
    return null;
  }
  const companyName = text(payload.company, 200);
  if (!companyName) {
    recordValidationFailure();
    return null;
  }
  return {
    slug: payload.slug,
    companyName,
    shortName: text(payload.short_name, 120),
    category: categoryOf(payload.category),
    status: text(payload.status, 40),
    openAt: instant(payload.open_date),
    closeAt: instant(payload.close_date),
    floorPriceRupees: rupees(payload.floor_price),
    discountRupees: rupees(payload.discount),
    nseSymbol: text(payload.nse_symbol, 40),
    bseScripCode: text(payload.bse_scripcode, 40),
    subscriptionTimes: times(payload.subscription),
    seller: text(payload.seller, 200),
    sharesOffered: count(payload.shares_offered),
    greenShoeShares: count(payload.green_shoe_size),
    book: bookOf(payload.book),
  };
}

export function mapOfsList(payload: unknown): OfsIssue[] {
  if (!Array.isArray(payload)) {
    recordValidationFailure();
    return [];
  }
  return payload.flatMap((row) => {
    const issue = mapOfsIssue(row);
    return issue ? [issue] : [];
  });
}

function bookOf(value: unknown): OfsBook | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    recordValidationFailure();
    return null;
  }
  return {
    observedAt: instant(value.data_timestamp),
    offerDateText: text(value.offer_date, 40),
    updatedLabel: text(value.updated_at_label, 80),
    floorPriceRupees: rupees(value.floor_price),
    indicativePriceRupees: rupees(value.indicative_price),
    lastTradedPriceRupees: rupees(value.ltp),
    subscriptionTimes: times(value.subscription_times),
    greenShoeSubscriptionTimes: times(value.gs_subscription_times),
    totalQuantity: count(value.total_qty),
    status: text(value.status, 40),
  };
}

function categoryOf(value: unknown): OfsCategory {
  if (value === "Retail") return "retail";
  if (value === "Non-Retail") return "non-retail";
  if (value === null || value === undefined || value === "") return "other";
  recordValidationFailure();
  return "other";
}

function instant(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    recordValidationFailure();
    return null;
  }
  const parsed = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(parsed)) {
    recordValidationFailure();
    return null;
  }
  return new Date(parsed).toISOString();
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    recordValidationFailure();
    return null;
  }
  return parsed;
}

function rupees(value: unknown): number | null {
  if (isRecord(value)) {
    recordValidationFailure();
    return null;
  }
  return finite(value);
}

function times(value: unknown): number | null {
  if (isRecord(value)) return finite(value.times_value ?? value.times ?? value.subscription_times);
  return finite(value);
}

function count(value: unknown): number | null {
  const parsed = finite(value);
  if (parsed === null) return null;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    recordValidationFailure();
    return null;
  }
  return parsed;
}

function text(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length === 0) {
    if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, max);
    recordValidationFailure();
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
