import type { GmpSnapshot, IpoStatus } from "@ipo-singh/contracts";
import { applicableIssuePriceRupees, gmpPercent, indicativeGmpImpliedPrice, isIndicativeGmpPrice, resolveFreshness } from "@ipo-singh/core";
import { recordValidationFailure } from "../../ops/validation.ts";

export type GmpMatchTarget = {
  slug: string;
  status: IpoStatus | null;
  offer: {
    issuePriceRupees: number | null;
    priceBandLowRupees: number | null;
    priceBandHighRupees: number | null;
  };
};

export type MappedGmpReading = {
  slug: string;
  snapshot: GmpSnapshot;
};

/**
 * Maps one `GET /gmp` collection onto stored open and upcoming issues.
 * `price_value` wins when it is a finite number. A null premium is omitted.
 * `"0"` stays zero. Percentage and the indicative price use the stored issue price.
 */
export function mapCurrentGmpCollection(rows: readonly unknown[], targets: readonly GmpMatchTarget[], now: Date): MappedGmpReading[] {
  const live = new Map(targets.filter((target) => target.status === "open" || target.status === "upcoming").map((target) => [target.slug, target]));
  const seen = new Set<string>();
  const readings: MappedGmpReading[] = [];
  for (const row of rows) {
    const mapped = mapRow(row, live, now);
    if (!mapped) continue;
    if (seen.has(mapped.slug)) {
      recordValidationFailure();
      continue;
    }
    seen.add(mapped.slug);
    readings.push(mapped);
  }
  return readings;
}

function mapRow(row: unknown, live: ReadonlyMap<string, GmpMatchTarget>, now: Date): MappedGmpReading | null {
  if (!isRecord(row)) {
    recordValidationFailure();
    return null;
  }
  const slug = typeof row.slug === "string" ? row.slug.trim() : "";
  const target = live.get(slug);
  if (!target) return null;
  if (!isRecord(row.gmp)) {
    if (row.gmp !== null && row.gmp !== undefined) recordValidationFailure();
    return null;
  }
  const amount = premiumAmount(row.gmp);
  if (amount.missing) return null;
  if (amount.failed || amount.value === null) {
    recordValidationFailure();
    return null;
  }
  const observedAt = utcTimestamp(row.gmp.updated_at);
  if (!observedAt) {
    if (row.gmp.updated_at !== null && row.gmp.updated_at !== undefined) recordValidationFailure();
    else recordValidationFailure();
    return null;
  }
  const issuePrice = applicablePrice(target, row.issue_price);
  const percent = gmpPercent({ gmpAmountRupees: amount.value, issuePriceRupees: issuePrice });
  const implied = indicativeGmpImpliedPrice({ gmpAmountRupees: amount.value, issuePriceRupees: issuePrice });
  const percentValue = percent.status === "value" ? percent.value : null;
  const impliedValue = isIndicativeGmpPrice(implied) ? implied.rupees : null;
  const vendorPercent = percentNumber(row.gmp.percentage);
  if (
    (vendorPercent !== null && percentValue !== null && Math.abs(vendorPercent - percentValue) > 0.05) ||
    (typeof row.gmp.estimated_listing_price === "number" &&
      impliedValue !== null &&
      Math.abs(row.gmp.estimated_listing_price - impliedValue) > 0.05)
  ) {
    recordValidationFailure();
  }
  return {
    slug,
    snapshot: {
      amountRupees: amount.value,
      percent: percentValue,
      indicativeImpliedPriceRupees: impliedValue,
      observedAt,
      freshness: resolveFreshness(new Date(observedAt), now),
    },
  };
}

function applicablePrice(target: GmpMatchTarget, vendorIssuePrice: unknown): number | null {
  const parsed = nonNegative(vendorIssuePrice);
  if (parsed.failed) recordValidationFailure();
  const stored = target.offer.issuePriceRupees;
  if (parsed.value !== null && stored !== null && Math.abs(parsed.value - stored) > 0.05) {
    recordValidationFailure();
  }
  const price = applicableIssuePriceRupees({
    issuePriceRupees: stored ?? parsed.value,
    priceBandLowRupees: target.offer.priceBandLowRupees,
    priceBandHighRupees: target.offer.priceBandHighRupees,
  });
  return price.status === "value" ? price.value : null;
}

function premiumAmount(gmp: Record<string, unknown>): { value: number | null; missing: boolean; failed: boolean } {
  if (Object.hasOwn(gmp, "price_value") && gmp.price_value !== null && gmp.price_value !== undefined) {
    if (typeof gmp.price_value === "number" && Number.isFinite(gmp.price_value)) {
      const raw = signed(gmp.price);
      if (raw.value !== null && Math.abs(raw.value - gmp.price_value) > 0.05) recordValidationFailure();
      return { value: gmp.price_value, missing: false, failed: false };
    }
    recordValidationFailure();
  }
  if (gmp.price === null || gmp.price === undefined || gmp.price === "") return { value: null, missing: true, failed: false };
  const parsed = signed(gmp.price);
  if (parsed.failed || parsed.value === null) return { value: null, missing: false, failed: true };
  return { value: parsed.value, missing: false, failed: false };
}

function signed(value: unknown): { value: number | null; failed: boolean } {
  const parsed = money(value);
  if (value === null || value === undefined || value === "") return { value: null, failed: false };
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

function utcTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
