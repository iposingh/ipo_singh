import { isIsoDate } from "@ipo-singh/core";
import { recordValidationFailure } from "../../ops/validation.ts";

export type UnlistedPriceSource = "unlistedzone" | "manual";

export type UnlistedQuote = {
  priceRupees: number | null;
  priceDate: string | null;
  observedAt: string | null;
  isStale: boolean | null;
  lotSizeShares: number | null;
  faceValueText: string | null;
  dealerLowRupees: number | null;
  dealerHighRupees: number | null;
  dealerMedianRupees: number | null;
};

export type UnlistedHistoryPoint = {
  observedAt: string;
  priceRupees: number | null;
};

/**
 * Indicative dealer quote for an unlisted or pre-IPO share.
 * This is not an exchange-traded last price and it is not an IPO catalogue row.
 */
export type UnlistedShare = {
  slug: string;
  name: string;
  displayName: string | null;
  isin: string | null;
  sector: string | null;
  quoteKind: "indicative_dealer_quote";
  priceSource: UnlistedPriceSource | null;
  quote: UnlistedQuote;
  history: UnlistedHistoryPoint[];
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Maps one unlisted list row or detail document. A quote that is not an indicative dealer quote is rejected. */
export function mapUnlistedShare(payload: unknown): UnlistedShare | null {
  if (!isRecord(payload) || typeof payload.slug !== "string" || !slugPattern.test(payload.slug) || payload.slug.length > 80) {
    recordValidationFailure();
    return null;
  }
  const name = text(payload.name, 200);
  if (!name) {
    recordValidationFailure();
    return null;
  }
  const price = isRecord(payload.price) ? payload.price : null;
  const quoteKind = text(payload.price_type, 40) ?? (price ? text(price.price_type, 40) : null);
  if (quoteKind !== "indicative_dealer_quote") {
    recordValidationFailure();
    return null;
  }
  const range = price && isRecord(price.dealer_range) ? price.dealer_range : isRecord(payload.dealer_range) ? payload.dealer_range : null;
  const history = Array.isArray(payload.price_history)
    ? payload.price_history.flatMap((row) => {
        if (!isRecord(row)) {
          recordValidationFailure();
          return [];
        }
        const observedAt = instant(row.date);
        if (!observedAt) return [];
        return [{ observedAt, priceRupees: rupees(row.price) }];
      })
    : [];
  return {
    slug: payload.slug,
    name,
    displayName: text(payload.display_name, 200),
    isin: text(payload.isin, 20),
    sector: text(payload.sector, 80),
    quoteKind: "indicative_dealer_quote",
    priceSource: sourceOf(price?.price_source ?? payload.price_source),
    quote: {
      priceRupees: rupees(price?.ltp ?? payload.ltp),
      priceDate: calendarDate(price?.price_date ?? payload.price_date),
      observedAt: instant(price?.updated_at ?? payload.ltp_updated_at),
      isStale: flag(price?.is_stale ?? payload.is_stale),
      lotSizeShares: count(price?.lot_size ?? payload.lot_size),
      faceValueText: text(price?.face_value, 40),
      dealerLowRupees: rupees(range?.low),
      dealerHighRupees: rupees(range?.high),
      dealerMedianRupees: rupees(range?.median),
    },
    history: history.slice(0, 400),
  };
}

export function mapUnlistedList(payload: unknown): UnlistedShare[] {
  if (!Array.isArray(payload)) {
    recordValidationFailure();
    return [];
  }
  return payload.flatMap((row) => {
    const share = mapUnlistedShare(row);
    return share ? [share] : [];
  });
}

function sourceOf(value: unknown): UnlistedPriceSource | null {
  if (value === null || value === undefined || value === "") return null;
  if (value === "unlistedzone" || value === "manual") return value;
  recordValidationFailure();
  return null;
}

function flag(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  recordValidationFailure();
  return null;
}

function calendarDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && isIsoDate(value)) return value;
  recordValidationFailure();
  return null;
}

function instant(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    recordValidationFailure();
    return null;
  }
  return new Date(value).toISOString();
}

function rupees(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    recordValidationFailure();
    return null;
  }
  return parsed;
}

function count(value: unknown): number | null {
  const parsed = rupees(value);
  if (parsed === null) return null;
  if (!Number.isSafeInteger(parsed)) {
    recordValidationFailure();
    return null;
  }
  return parsed;
}

function text(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length === 0) {
    recordValidationFailure();
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
