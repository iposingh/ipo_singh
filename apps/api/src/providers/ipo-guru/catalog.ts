import type { Ipo, IpoListQuery, IpoStatus, IpoSummary, Provenance } from "@ipo-singh/contracts";
import { ipoSchema, ipoSummarySchema, stableIdSchema } from "@ipo-singh/contracts";
import {
  actualListingGainPercent,
  gmpPercent,
  indicativeGmpImpliedPrice,
  isIndicativeGmpPrice,
  isIsoDate,
  istCalendarDate,
  resolveFreshness,
  resolveIpoLifecycle,
} from "@ipo-singh/core";
import { recordValidationFailure } from "../../ops/validation.ts";
import type { IpoGuruListQuery } from "./client.ts";

/**
 * Vendor list query for `GET /ipos`.
 * An unfiltered refresh uses `months=0` so the default three-month window does not drop older issues.
 * `search` omits `months` because the vendor ignores the window when search is set.
 * `allotment` is an IPO Singh status. The vendor rejects it with 422, so it is applied after mapping.
 */
export function catalogVendorQuery(query: IpoListQuery): IpoGuruListQuery {
  const vendor: IpoGuruListQuery = {};
  if (query.board) vendor.type = query.board;
  if (query.status === "open" || query.status === "upcoming" || query.status === "closed" || query.status === "listed") {
    vendor.status = query.status;
  }
  if (query.q) vendor.search = query.q;
  else vendor.months = 0;
  if (query.limit) vendor.limit = query.limit;
  return vendor;
}

export function mapIpoCatalog(rows: readonly unknown[], now: Date, provenance: Provenance): { issues: Ipo[]; summaries: IpoSummary[] } {
  const today = istCalendarDate(now);
  const seen = new Set<string>();
  const issues: Ipo[] = [];
  for (const row of rows) {
    const mapped = mapRow(row, now, today, provenance);
    if (!mapped) continue;
    if (seen.has(mapped.slug)) {
      recordValidationFailure();
      continue;
    }
    seen.add(mapped.slug);
    issues.push(mapped);
  }
  return {
    issues,
    summaries: issues.map((issue) =>
      ipoSummarySchema.parse({
        id: issue.id,
        slug: issue.slug,
        companyName: issue.companyName,
        board: issue.board,
        status: issue.status,
        openDate: issue.dates.openDate,
        closeDate: issue.dates.closeDate,
        gmpAmountRupees: issue.gmp?.amountRupees ?? null,
        subscriptionTotalTimes: issue.subscription?.totalTimes ?? null,
        provenance: issue.provenance,
      }),
    ),
  };
}

export function matchesCatalogQuery(issue: Ipo, query: IpoListQuery): boolean {
  if (query.board && issue.board !== query.board) return false;
  if (query.status === "allotment") return issue.status === "allotment";
  if (query.status === "closed") return issue.status === "closed" || issue.status === "allotment";
  if (query.status && issue.status !== query.status) return false;
  return true;
}

function mapRow(row: unknown, now: Date, today: string | null, provenance: Provenance): Ipo | null {
  if (!isRecord(row)) {
    recordValidationFailure();
    return null;
  }
  const slug = typeof row.slug === "string" ? row.slug.trim() : "";
  if (!stableIdSchema.safeParse(slug).success) {
    recordValidationFailure();
    return null;
  }
  const board = boardOf(row.type);
  if (!board) {
    recordValidationFailure();
    return null;
  }
  const companyName = plainName(row.name);
  if (!companyName) {
    recordValidationFailure();
    return null;
  }
  const withholdTerms = row.dates_tba === true || row.stage === "pre_rhp";
  const dates = withholdTerms
    ? { openDate: null, closeDate: null, allotmentDate: null, listingDate: null }
    : {
        openDate: calendarDate(row.open_date),
        closeDate: calendarDate(row.close_date),
        allotmentDate: calendarDate(row.allotment_date),
        listingDate: calendarDate(row.listing_date),
      };
  const priceMin = withholdTerms ? { value: null, failed: false } : rupees(row.price_min, false);
  const priceMax = withholdTerms ? { value: null, failed: false } : rupees(row.price_max, false);
  const issuePrice = rupees(row.issue_price, true);
  const offer = {
    priceBand: {
      lowRupees: priceMin.failed ? null : priceMin.value,
      highRupees: priceMax.failed ? null : priceMax.value,
    },
    issuePriceRupees: issuePrice.failed ? null : issuePrice.value,
    issueSizeRupees: croreToRupees(row.issue_size),
    lotSizeShares: withholdTerms ? null : lotShares(row.lot_size),
    minimumInvestmentRupees: withholdTerms ? null : rupees(row.min_investment, false).value,
  };
  if (priceMin.failed || priceMax.failed || issuePrice.failed) recordValidationFailure();
  if (
    offer.priceBand.lowRupees !== null &&
    offer.priceBand.highRupees !== null &&
    offer.priceBand.highRupees < offer.priceBand.lowRupees
  ) {
    recordValidationFailure();
    offer.priceBand.lowRupees = null;
    offer.priceBand.highRupees = null;
  }
  const gmp = mapGmp(row.gmp, offer, now);
  const listingPrice = rupees(row.listing_price, true);
  const gain = actualListingGainPercent({
    listingPriceRupees: listingPrice.value,
    issuePriceRupees: offer.issuePriceRupees,
  });
  const gainPercent = gain.status === "value" ? gain.value : null;
  if (typeof row.listing_gain_percent === "number" && gainPercent !== null && Math.abs(row.listing_gain_percent - gainPercent) > 0.05) {
    recordValidationFailure();
  }
  const total = times(row.subscription_total);
  const candidate = {
    id: slug,
    slug,
    companyName,
    board,
    status: statusOf(row, dates, today),
    offer,
    dates,
    gmp: gmp.snapshot,
    subscription:
      typeof total === "number"
        ? {
            retailTimes: null,
            qibTimes: null,
            niiTimes: null,
            employeeTimes: null,
            totalTimes: total,
            observedAt: null,
            freshness: "missing" as const,
          }
        : null,
    financials: [],
    registrar: null,
    documents: [],
    listing: {
      issuePriceRupees: offer.issuePriceRupees,
      listingPriceRupees: listingPrice.value,
      gainPercent,
      listedOn: dates.listingDate,
    },
    provenance,
  };
  const parsed = ipoSchema.safeParse(candidate);
  if (!parsed.success) {
    recordValidationFailure();
    return null;
  }
  if (gmp.disagreed) recordValidationFailure();
  return parsed.data;
}

function mapGmp(
  value: unknown,
  offer: Ipo["offer"],
  now: Date,
): { snapshot: Ipo["gmp"]; disagreed: boolean } {
  if (value === null || value === undefined) return { snapshot: null, disagreed: false };
  if (!isRecord(value)) {
    recordValidationFailure();
    return { snapshot: null, disagreed: false };
  }
  const amount = signedRupees(value.price);
  if (amount.failed) recordValidationFailure();
  if (value.price === null || value.price === undefined || value.price === "") return { snapshot: null, disagreed: false };
  if (amount.value === null) return { snapshot: null, disagreed: false };
  const observedAt = utcTimestamp(value.updated_at);
  const percent = gmpPercent({
    gmpAmountRupees: amount.value,
    issuePriceRupees: offer.issuePriceRupees ?? offer.priceBand.highRupees,
  });
  const implied = indicativeGmpImpliedPrice({
    gmpAmountRupees: amount.value,
    issuePriceRupees: offer.issuePriceRupees ?? offer.priceBand.highRupees,
  });
  const percentValue = percent.status === "value" ? percent.value : null;
  const impliedValue = isIndicativeGmpPrice(implied) ? implied.rupees : null;
  const vendorPercent = percentNumber(value.percentage);
  const disagreed =
    (vendorPercent !== null && percentValue !== null && Math.abs(vendorPercent - percentValue) > 0.05) ||
    (typeof value.estimated_listing_price === "number" &&
      impliedValue !== null &&
      Math.abs(value.estimated_listing_price - impliedValue) > 0.05);
  return {
    disagreed,
    snapshot: {
      amountRupees: amount.value,
      percent: percentValue,
      indicativeImpliedPriceRupees: impliedValue,
      observedAt,
      freshness: resolveFreshness(observedAt ? new Date(observedAt) : null, now),
    },
  };
}

function statusOf(
  row: Record<string, unknown>,
  dates: Ipo["dates"],
  today: string | null,
): IpoStatus | null {
  let providerStatus: IpoStatus | null = null;
  if (row.is_listed === true) providerStatus = "listed";
  else if (row.stage === "pre_rhp") providerStatus = "upcoming";
  else if (row.status === "Upcoming") providerStatus = "upcoming";
  else if (row.status === "Open") providerStatus = "open";
  else if (row.status === "Closed") providerStatus = "closed";
  else if (row.status !== undefined && row.status !== null) {
    recordValidationFailure();
    return null;
  }

  if (!today) return providerStatus;
  const resolved = resolveIpoLifecycle({
    today,
    openDate: dates.openDate,
    closeDate: dates.closeDate,
    allotmentDate: dates.allotmentDate,
    listingDate: dates.listingDate,
    providerStatus,
    listingConfirmed: row.is_listed === true,
  });
  if (resolved.status === "unknown") return providerStatus;
  return resolved.status;
}

function boardOf(value: unknown): Ipo["board"] | null {
  if (value === "Mainboard") return "mainboard";
  if (value === "SME") return "sme";
  // OFS and unlisted quotes use separate vendor endpoints and must never become IPO rows.
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "ofs" ||
      normalized === "offer for sale" ||
      normalized === "unlisted" ||
      normalized === "pre-ipo" ||
      normalized === "preipo"
    ) {
      recordValidationFailure();
    }
  }
  return null;
}

function plainName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim();
  if (name.length === 0 || name.length > 200) return null;
  return name;
}

function calendarDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !isIsoDate(value)) {
    recordValidationFailure();
    return null;
  }
  return value;
}

function rupees(value: unknown, allowString: boolean): { value: number | null; failed: boolean } {
  if (value === null || value === undefined || value === "") return { value: null, failed: false };
  const parsed = allowString || typeof value === "number" ? money(value) : null;
  if (parsed === null || parsed < 0) return { value: null, failed: true };
  return { value: parsed, failed: false };
}

function signedRupees(value: unknown): { value: number | null; failed: boolean } {
  if (value === null || value === undefined || value === "") return { value: null, failed: false };
  const parsed = money(value);
  if (parsed === null) return { value: null, failed: true };
  return { value: parsed, failed: false };
}

function money(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const body = value.trim().replace(/,/g, "");
  if (body === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(body)) return null;
  const parsed = Number(body);
  return Number.isFinite(parsed) ? parsed : null;
}

function croreToRupees(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(/,/g, "") : "";
  if (!/^\d+(\.\d+)?$/.test(text)) {
    recordValidationFailure();
    return null;
  }
  const [whole, fraction = ""] = text.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  const numerator = BigInt(digits === "" ? "0" : digits);
  const divisor = 10n ** BigInt(fraction.length);
  const scale = 1_000_000_000n;
  const product = numerator * scale;
  const paise = product / divisor;
  const remainder = product % divisor;
  const rounded = remainder * 2n >= divisor ? paise + 1n : paise;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    recordValidationFailure();
    return null;
  }
  return Number(rounded) / 100;
}

function lotShares(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    recordValidationFailure();
    return null;
  }
  return value;
}

/** `undefined` means the field was absent or blank. `null` is not used; a blank string is unknown. */
function times(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = money(value);
  if (parsed === null || parsed < 0) {
    recordValidationFailure();
    return null;
  }
  return parsed;
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
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) {
    recordValidationFailure();
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
