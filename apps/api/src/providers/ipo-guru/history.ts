import type { GmpHistoryWindow, GmpObservation } from "@ipo-singh/contracts";
import { applicableIssuePriceRupees, gmpPercent, indicativeGmpImpliedPrice, isIndicativeGmpPrice, isIsoDate, istCivilDateTime, istDateAnchor } from "@ipo-singh/core";
import { recordValidationFailure } from "../../ops/validation.ts";

export type GmpHistoryTarget = {
  offer: {
    issuePriceRupees: number | null;
    priceBandLowRupees: number | null;
    priceBandHighRupees: number | null;
  };
};

export type MappedGmpHistory = {
  observations: GmpObservation[];
  window: GmpHistoryWindow;
  /** Newest intraday capture. A date-only series has no capture clock. */
  sourceUpdatedAt: string | null;
};

/**
 * Maps one `GET /ipos/{slug}/gmp/history` document.
 * Daily points keep the published date. Their stored instant is 00:00 Asia/Kolkata, not a capture time.
 * Intraday `recorded_at` is Asia/Kolkata civil time and is converted to UTC once.
 * Missing days and missing slots are omitted. They are not filled with zero or with invented readings.
 * Returns null when the document is not a history payload.
 */
export function mapGmpHistory(payload: unknown, target: GmpHistoryTarget, vendorIssuePrice?: unknown): MappedGmpHistory | null {
  if (!isRecord(payload) || !Array.isArray(payload.trend)) {
    recordValidationFailure();
    return null;
  }
  const summary = isRecord(payload.summary) ? payload.summary : null;
  if (!summary) recordValidationFailure();
  const issuePrice = applicablePrice(target, summary?.issue_price ?? vendorIssuePrice);
  const daily = new Map<string, GmpObservation>();
  for (const row of payload.trend) {
    const point = dailyPoint(row, issuePrice);
    if (!point?.observedOn) continue;
    if (daily.has(point.observedOn)) recordValidationFailure();
    daily.set(point.observedOn, point);
  }
  const timeline = timelineRows(payload);
  const intraday = new Map<string, GmpObservation>();
  let sourceUpdatedAt: string | null = null;
  for (const row of timeline.rows) {
    const point = intradayPoint(row, issuePrice);
    if (!point) continue;
    if (intraday.has(point.observedAt)) recordValidationFailure();
    intraday.set(point.observedAt, point);
    if (!sourceUpdatedAt || point.observedAt > sourceUpdatedAt) sourceUpdatedAt = point.observedAt;
  }
  const observations = [...daily.values(), ...intraday.values()].sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  return {
    observations,
    window: {
      high: extreme(summary?.high),
      low: extreme(summary?.low),
      truncated: truncatedFlag(payload.truncated),
      timelineLocked: timeline.locked && intraday.size === 0,
    },
    sourceUpdatedAt,
  };
}

function dailyPoint(row: unknown, issuePrice: number | null): GmpObservation | null {
  if (!isRecord(row) || typeof row.date !== "string" || !isIsoDate(row.date)) {
    recordValidationFailure();
    return null;
  }
  const amount = premiumAmount(row);
  if (amount.missing || amount.failed || amount.value === null) {
    if (!amount.missing || amount.failed) recordValidationFailure();
    return null;
  }
  const anchor = istDateAnchor(row.date);
  if (!anchor) {
    recordValidationFailure();
    return null;
  }
  const priced = pricedPoint(row, amount.value, issuePrice);
  return {
    observedAt: anchor.toISOString(),
    observedOn: row.date,
    amountRupees: amount.value,
    percent: priced.percent,
    session: "daily",
    slotLabel: null,
  };
}

function intradayPoint(row: unknown, issuePrice: number | null): GmpObservation | null {
  if (!isRecord(row)) {
    recordValidationFailure();
    return null;
  }
  if (row.slot !== null && row.slot !== undefined && row.slot !== 11 && row.slot !== 17 && row.slot !== 22) {
    recordValidationFailure();
  }
  const recorded = typeof row.recorded_at === "string" ? istCivilDateTime(row.recorded_at) : null;
  if (!recorded) {
    recordValidationFailure();
    return null;
  }
  const amount = premiumAmount(row);
  if (amount.missing || amount.failed || amount.value === null) {
    recordValidationFailure();
    return null;
  }
  const label = slotLabel(row.slot_label);
  if (row.slot_label !== null && row.slot_label !== undefined && label === null) recordValidationFailure();
  const priced = pricedPoint(row, amount.value, issuePrice);
  const observedOn = typeof row.date === "string" && isIsoDate(row.date) ? row.date : null;
  if (row.date !== undefined && row.date !== null && observedOn === null) recordValidationFailure();
  return {
    observedAt: recorded.toISOString(),
    observedOn,
    amountRupees: amount.value,
    percent: priced.percent,
    session: "intraday",
    slotLabel: label,
  };
}

function pricedPoint(row: Record<string, unknown>, amount: number, issuePrice: number | null): { percent: number | null } {
  const percent = gmpPercent({ gmpAmountRupees: amount, issuePriceRupees: issuePrice });
  const percentValue = percent.status === "value" ? percent.value : null;
  const implied = indicativeGmpImpliedPrice({ gmpAmountRupees: amount, issuePriceRupees: issuePrice });
  const impliedValue = isIndicativeGmpPrice(implied) ? implied.rupees : null;
  const vendorPercent = percentNumber(row.percentage);
  const vendorImplied = typeof row.estimated_listing_price === "number" && Number.isFinite(row.estimated_listing_price) ? row.estimated_listing_price : null;
  if (
    (vendorPercent !== null && percentValue !== null && Math.abs(vendorPercent - percentValue) > 0.05) ||
    (vendorImplied !== null && impliedValue !== null && Math.abs(vendorImplied - impliedValue) > 0.05)
  ) {
    recordValidationFailure();
  }
  if (row.estimated_listing_price !== null && row.estimated_listing_price !== undefined && vendorImplied === null) {
    recordValidationFailure();
  }
  return { percent: percentValue };
}

function timelineRows(payload: Record<string, unknown>): { rows: unknown[]; locked: boolean } {
  const locked = Array.isArray(payload.locked) && payload.locked.some((item) => item === "timeline");
  if (payload.locked !== undefined && !Array.isArray(payload.locked)) recordValidationFailure();
  if (payload.timeline === undefined) {
    recordValidationFailure();
    return { rows: [], locked };
  }
  if (!Array.isArray(payload.timeline)) {
    recordValidationFailure();
    return { rows: [], locked };
  }
  return { rows: payload.timeline, locked };
}

function extreme(value: unknown): GmpHistoryWindow["high"] {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    recordValidationFailure();
    return null;
  }
  const amount = signed(value.price);
  const date = typeof value.date === "string" && isIsoDate(value.date) ? value.date : null;
  if (amount.failed || amount.value === null || !date) {
    recordValidationFailure();
    return null;
  }
  return { amountRupees: amount.value, observedOn: date };
}

function truncatedFlag(value: unknown): boolean {
  if (value === undefined || value === false) return false;
  if (value === true) return true;
  recordValidationFailure();
  return true;
}

function applicablePrice(target: GmpHistoryTarget, vendorIssuePrice: unknown): number | null {
  const parsed = nonNegative(vendorIssuePrice);
  if (parsed.failed) recordValidationFailure();
  const stored = target.offer.issuePriceRupees;
  if (parsed.value !== null && stored !== null && Math.abs(parsed.value - stored) > 0.05) recordValidationFailure();
  const price = applicableIssuePriceRupees({
    issuePriceRupees: stored ?? parsed.value,
    priceBandLowRupees: target.offer.priceBandLowRupees,
    priceBandHighRupees: target.offer.priceBandHighRupees,
  });
  return price.status === "value" ? price.value : null;
}

function premiumAmount(row: Record<string, unknown>): { value: number | null; missing: boolean; failed: boolean } {
  if (Object.hasOwn(row, "price_value") && row.price_value !== null && row.price_value !== undefined) {
    if (typeof row.price_value === "number" && Number.isFinite(row.price_value)) {
      const raw = signed(row.price);
      if (raw.value !== null && Math.abs(raw.value - row.price_value) > 0.05) recordValidationFailure();
      return { value: row.price_value, missing: false, failed: false };
    }
    return { value: null, missing: false, failed: true };
  }
  if (!Object.hasOwn(row, "price") || row.price === null || row.price === undefined || row.price === "") {
    return { value: null, missing: true, failed: false };
  }
  const parsed = signed(row.price);
  if (parsed.failed || parsed.value === null) return { value: null, missing: false, failed: true };
  return { value: parsed.value, missing: false, failed: false };
}

function slotLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || text.length > 40) return null;
  if ([...text].some((character) => character.charCodeAt(0) <= 31)) return null;
  return text;
}

function signed(value: unknown): { value: number | null; failed: boolean } {
  if (value === null || value === undefined || value === "") return { value: null, failed: false };
  const parsed = money(value);
  if (parsed === null) return { value: null, failed: true };
  return { value: parsed, failed: false };
}

function nonNegative(value: unknown): { value: number | null; failed: boolean } {
  if (value === null || value === undefined || value === "") return { value: null, failed: false };
  const parsed = money(value);
  if (parsed === null || parsed < 0) return { value: null, failed: true };
  return { value: parsed, failed: false };
}

function money(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const body = value.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(body)) return null;
  const parsed = Number(body);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const body = value.trim().replace(/%$/, "").replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(body)) return null;
  const parsed = Number(body);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
