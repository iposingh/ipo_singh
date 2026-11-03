import type { Ipo, IpoProfile, Provenance } from "@ipo-singh/contracts";
import { ipoProfileSchema } from "@ipo-singh/contracts";
import { isIsoDate, verifiedAllotmentUrl } from "@ipo-singh/core";
import { recordValidationFailure } from "../../ops/validation.ts";
import { mapIpoCatalog } from "./catalog.ts";

export type MappedIpoDetail = {
  ipo: Ipo;
  profile: IpoProfile;
  /** False when the paid company block was omitted. Narrative fields should be left as last stored. */
  companyPresent: boolean;
};

const documentKinds = {
  rhp: "rhp",
  drhp: "drhp",
  prospectus: "source",
  anchor: "source",
  basis_of_allotment: "source",
  "basis-of-allotment": "source",
  boa: "source",
} as const;

const documentTitles = {
  rhp: "Red herring prospectus",
  drhp: "Draft red herring prospectus",
  prospectus: "Prospectus",
  anchor: "Anchor document",
  basis_of_allotment: "Basis of allotment",
  "basis-of-allotment": "Basis of allotment",
  boa: "Basis of allotment",
} as const;

/**
 * Maps one `GET /ipos/{slug}` document.
 * Timeline, issue terms, and listing are on every plan. Company, contacts, and documents need `details_full`.
 * A Free response that names those blocks in `locked` stays a successful document with those blocks empty.
 * Vendor financial rows are kept with their headers and unit. They are not copied into revenue, profit, or EPS.
 */
export function mapIpoDetail(payload: unknown, now: Date, provenance: Provenance): MappedIpoDetail | null {
  if (!isRecord(payload)) {
    recordValidationFailure();
    return null;
  }
  const timeline = isRecord(payload.timeline) ? payload.timeline : {};
  const issue = isRecord(payload.issue) ? payload.issue : {};
  const listing = isRecord(payload.listing) ? payload.listing : {};
  const flat = {
    slug: payload.slug,
    name: payload.name,
    type: payload.type,
    status: payload.status,
    is_listed: payload.is_listed,
    stage: payload.stage,
    dates_tba: payload.dates_tba,
    open_date: timeline.open_date ?? payload.open_date,
    close_date: timeline.close_date ?? payload.close_date,
    allotment_date: timeline.allotment_date ?? payload.allotment_date,
    listing_date: timeline.listing_date ?? payload.listing_date,
    price_min: issue.price_min ?? payload.price_min,
    price_max: issue.price_max ?? payload.price_max,
    issue_price: issue.issue_price ?? payload.issue_price,
    issue_size: issue.issue_size ?? payload.issue_size,
    lot_size: issue.lot_size ?? payload.lot_size,
    min_investment: issue.min_investment ?? payload.min_investment,
    listing_price: listing.listing_price ?? payload.listing_price,
    listing_gain_percent: listing.listing_gain_percent ?? payload.listing_gain_percent,
    gmp: payload.gmp,
  };
  const catalog = mapIpoCatalog([flat], now, provenance).issues[0];
  if (!catalog) return null;
  const companyPresent = isRecord(payload.company);
  const company = isRecord(payload.company) ? payload.company : {};
  const registrarBlock = isRecord(payload.contacts) && isRecord(payload.contacts.registrar) ? payload.contacts.registrar : null;
  const profile = buildProfile(timeline, listing, company, companyPresent, payload.objects_of_issue);
  const parsedProfile = ipoProfileSchema.safeParse(profile);
  if (!parsedProfile.success) {
    recordValidationFailure();
    return null;
  }
  return {
    ipo: {
      ...catalog,
      registrar: registrarOf(registrarBlock),
      documents: documentsOf(payload.documents),
    },
    profile: parsedProfile.data,
    companyPresent,
  };
}

export function mergeIpoProfile(previous: IpoProfile | null | undefined, next: IpoProfile, companyPresent: boolean): IpoProfile {
  if (companyPresent || !previous) return next;
  return {
    ...previous,
    refundDate: next.refundDate,
    dematCreditDate: next.dematCreditDate,
    cmpRupees: next.cmpRupees,
    currentGainPercent: next.currentGainPercent,
    ...(next.anchors ? { anchors: next.anchors } : {}),
  };
}

function buildProfile(
  timeline: Record<string, unknown>,
  listing: Record<string, unknown>,
  company: Record<string, unknown>,
  companyPresent: boolean,
  topLevelObjects: unknown,
): IpoProfile {
  const objects = objectsOf(company.objects_of_issue ?? topLevelObjects);
  const financials = financialsOf(company.financials);
  const promoterNarrative = companyPresent ? narrative(company.promoters_text) : null;
  return {
    refundDate: calendarDate(timeline.refund_date),
    dematCreditDate: calendarDate(timeline.credit_to_demat_date),
    about: companyPresent ? narrative(company.about) : null,
    description: companyPresent ? narrative(company.description) : null,
    strengths: companyPresent ? lines(company.strengths) : [],
    risks: companyPresent ? lines(company.risks) : [],
    promoters: companyPresent ? promotersOf(company.promoters) : [],
    ...(promoterNarrative ? { promoterNarrative } : {}),
    objectsOfIssue: companyPresent ? objects : { items: [], text: null },
    sourceFinancials: companyPresent ? financials : { unit: null, headers: [], rows: [], text: null },
    cmpRupees: rupees(listing.cmp),
    currentGainPercent: finite(listing.current_gain_percent),
  };
}

function registrarOf(value: Record<string, unknown> | null): Ipo["registrar"] {
  if (!value || typeof value.name !== "string" || value.name.trim().length === 0) return null;
  const name = clip(value.name, 200);
  const slug = typeof value.slug === "string" ? value.slug : null;
  const statusPage = typeof value.status_page === "string" ? value.status_page : null;
  return {
    name,
    websiteUrl: null,
    allotmentUrl: verifiedAllotmentUrl({ name, slug, statusPage }),
  };
}

function documentsOf(value: unknown): Ipo["documents"] {
  if (value === null || value === undefined) return [];
  if (!isRecord(value)) {
    recordValidationFailure();
    return [];
  }
  const documents: Ipo["documents"] = [];
  for (const [key, kind] of Object.entries(documentKinds)) {
    if (!(key in value) || value[key] === null) continue;
    const link = documentLink(value[key]);
    if (!link) continue;
    documents.push({
      kind,
      title: link.title ?? documentTitles[key as keyof typeof documentTitles],
      url: link.url,
      publishedOn: null,
    });
  }
  return documents;
}

function documentLink(value: unknown): { url: string; title: string | null } | null {
  if (typeof value === "string") return httpUrl(value) ? { url: value, title: null } : null;
  if (!isRecord(value)) {
    recordValidationFailure();
    return null;
  }
  const raw = typeof value.url === "string" ? value.url : typeof value.link === "string" ? value.link : null;
  if (!raw || !httpUrl(raw)) return null;
  const title = typeof value.title === "string" && value.title.trim() ? clip(value.title, 200) : null;
  return { url: raw, title };
}

function financialsOf(value: unknown): IpoProfile["sourceFinancials"] {
  const empty = { unit: null, headers: [] as string[], rows: [] as IpoProfile["sourceFinancials"]["rows"], text: null };
  if (value === null || value === undefined) return empty;
  if (typeof value === "string") return { ...empty, text: narrative(value) };
  if (!isRecord(value)) {
    recordValidationFailure();
    return empty;
  }
  const headers = Array.isArray(value.headers) ? value.headers.flatMap((item) => (typeof item === "string" && item.trim() ? [clip(item, 40)] : [])) : [];
  const rows = Array.isArray(value.rows)
    ? value.rows.flatMap((row) => {
        if (!isRecord(row) || typeof row.metric !== "string" || !row.metric.trim()) {
          recordValidationFailure();
          return [];
        }
        const data = Array.isArray(row.data) ? row.data.slice(0, 12).map((item) => (typeof item === "string" ? clip(item, 40) : null)) : [];
        return [{ metric: clip(row.metric, 120), values: data }];
      })
    : [];
  const text = narrative(value.text);
  return {
    unit: typeof value.unit === "string" && value.unit.trim() ? clip(value.unit, 40) : null,
    headers: headers.slice(0, 12),
    rows: rows.slice(0, 40),
    text: rows.length > 0 ? null : text,
  };
}

function objectsOf(value: unknown): IpoProfile["objectsOfIssue"] {
  if (typeof value === "string") return { items: [], text: narrative(value) };
  if (value === null || value === undefined) return { items: [], text: null };
  if (!isRecord(value)) {
    recordValidationFailure();
    return { items: [], text: null };
  }
  const items = Array.isArray(value.items) ? value.items.flatMap((item) => (typeof item === "string" && item.trim() ? [clip(item, 500)] : [])) : [];
  return { items: items.slice(0, 40), text: items.length > 0 ? null : narrative(value.text) };
}

function promotersOf(value: unknown): IpoProfile["promoters"] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    recordValidationFailure();
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [{ name: clip(item, 200), profile: null }];
    if (!isRecord(item) || typeof item.name !== "string" || !item.name.trim()) {
      recordValidationFailure();
      return [];
    }
    const profile = typeof item.profile === "string" ? item.profile : typeof item.about === "string" ? item.about : typeof item.designation === "string" ? item.designation : null;
    return [{ name: clip(item.name, 200), profile: narrative(profile) }];
  }).slice(0, 40);
}

function lines(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    recordValidationFailure();
    return [];
  }
  return value.flatMap((item) => (typeof item === "string" && item.trim() ? [clip(item, 500)] : [])).slice(0, 40);
}

function narrative(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return clip(value, 4_000);
}

function calendarDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && isIsoDate(value)) return value;
  recordValidationFailure();
  return null;
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

function finite(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    recordValidationFailure();
    return null;
  }
  return value;
}

function httpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
