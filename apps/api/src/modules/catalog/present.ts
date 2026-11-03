import type { IpoProfile } from "@ipo-singh/contracts";
import { ipoProfileSchema } from "@ipo-singh/contracts";
import {
  istCalendarDate,
  istDateAnchor,
  registrarPortalForName,
  resolveIpoLifecycle,
  verifiedAllotmentUrl,
} from "@ipo-singh/core";
import {
  ipoDatesSchema,
  ipoSchema,
  ipoSummarySchema,
  type GmpHistory,
  type GmpSnapshot,
  type Ipo,
  type IpoSummary,
  type GmpHistoryWindow,
  type Provenance,
  type SubscriptionHistory,
  type SubscriptionSnapshot,
} from "@ipo-singh/contracts";
import { z } from "zod";
import type {
  CompanyRecord,
  FinancialStatementRecord,
  GmpHistoryWindowRecord,
  GmpObservationRecord,
  IpoRecord,
  RegistrarRecord,
  SourceDocumentRecord,
  SourceMetadataRecord,
  SubscriptionObservationRecord,
} from "../../db/records.ts";
import { HttpError } from "../../shared/errors.ts";
import { publicHttpUrl, publicPlainText } from "../../shared/public-text.ts";

export const directoryRowSchema = z
  .object({
    summary: ipoSummarySchema,
    allotmentDate: ipoDatesSchema.shape.allotmentDate,
    listingDate: ipoDatesSchema.shape.listingDate,
    symbol: z.string().trim().min(1).max(40).nullable(),
  })
  .strict();

export type DirectoryRow = z.infer<typeof directoryRowSchema>;

let catalogNow: () => Date = () => new Date();

/** Test hook. Production code leaves the wall clock alone. */
export function setCatalogNow(now: () => Date): void {
  catalogNow = now;
}

export function resetCatalogNow(): void {
  catalogNow = () => new Date();
}

/** Re-apply IST lifecycle on cached public payloads so a stale Open cannot outlive the close date. */
export function refreshPublicIpoStatus(ipo: Ipo): Ipo {
  const today = istCalendarDate(catalogNow()) ?? "";
  if (!today) return ipo;
  const listingConfirmed = Boolean(
    ipo.listing &&
      ((typeof ipo.listing.listingPriceRupees === "number" && Number.isFinite(ipo.listing.listingPriceRupees)) || ipo.status === "listed"),
  );
  const resolved = resolveIpoLifecycle({
    today,
    openDate: ipo.dates.openDate,
    closeDate: ipo.dates.closeDate,
    allotmentDate: ipo.dates.allotmentDate,
    listingDate: ipo.dates.listingDate,
    providerStatus: ipo.status,
    listingConfirmed,
    allotmentConfirmed: ipo.allotmentConfirmed === true,
  });
  if (resolved.status === "unknown" || resolved.status === ipo.status) return ipo;
  return { ...ipo, status: resolved.status };
}

export function refreshPublicSummaryStatus(summary: IpoSummary): IpoSummary {
  const today = istCalendarDate(catalogNow()) ?? "";
  if (!today) return summary;
  const resolved = resolveIpoLifecycle({
    today,
    openDate: summary.openDate,
    closeDate: summary.closeDate,
    allotmentDate: summary.allotmentDate ?? null,
    listingDate: summary.listingDate ?? null,
    providerStatus: summary.status,
    listingConfirmed: summary.status === "listed" || isPresentListingPrice(summary.listingPriceRupees),
    allotmentConfirmed: summary.allotmentConfirmed === true,
  });
  if (resolved.status === "unknown" || resolved.status === summary.status) return summary;
  return { ...summary, status: resolved.status };
}

function isPresentListingPrice(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function provenanceOf(source: SourceMetadataRecord): Provenance {
  return {
    sourceName: source.source,
    retrievedAt: source.fetchedAt.toISOString(),
    freshness: source.freshness,
  };
}

function missingProvenance(ipo: Ipo): Provenance {
  return {
    sourceName: ipo.provenance.sourceName,
    retrievedAt: ipo.provenance.retrievedAt,
    freshness: "missing",
  };
}

function latest<T extends { observedAt: Date }>(rows: readonly T[]): T | null {
  let chosen: T | null = null;
  for (const row of rows) {
    if (!chosen || row.observedAt.getTime() >= chosen.observedAt.getTime()) chosen = row;
  }
  return chosen;
}

export function gmpSnapshot(row: GmpObservationRecord | null): GmpSnapshot | null {
  if (!row) return null;
  return {
    amountRupees: row.amountRupees,
    percent: row.percent,
    indicativeImpliedPriceRupees: row.indicativeImpliedPriceRupees,
    observedAt: row.observedAt.toISOString(),
    freshness: row.source.freshness,
  };
}

function subscriptionOrder(row: SubscriptionObservationRecord): number {
  if (row.observedAt instanceof Date && !Number.isNaN(row.observedAt.getTime())) return row.observedAt.getTime();
  const anchor = row.observedOn ? istDateAnchor(row.observedOn) : null;
  return anchor?.getTime() ?? Number.NEGATIVE_INFINITY;
}

function latestSubscription(rows: readonly SubscriptionObservationRecord[]): SubscriptionObservationRecord | null {
  let chosen: SubscriptionObservationRecord | null = null;
  for (const row of rows) {
    if (!chosen || subscriptionOrder(row) >= subscriptionOrder(chosen)) chosen = row;
  }
  return chosen;
}

export function subscriptionSnapshot(row: SubscriptionObservationRecord | null): SubscriptionSnapshot | null {
  if (!row) return null;
  return {
    retailTimes: row.retailTimes,
    qibTimes: row.qibTimes,
    niiTimes: row.niiTimes,
    employeeTimes: row.employeeTimes,
    shareholderTimes: row.shareholderTimes ?? null,
    anchorTimes: row.anchorTimes ?? null,
    categories: row.categories ?? [],
    totalTimes: row.totalTimes,
    observedAt: row.observedAt instanceof Date && !Number.isNaN(row.observedAt.getTime()) ? row.observedAt.toISOString() : null,
    observedOn: row.observedOn ?? null,
    biddingDay: row.biddingDay ?? null,
    freshness: row.source.freshness,
  };
}

function publicProfile(value: IpoRecord["profile"]): IpoProfile | null {
  const parsed = ipoProfileSchema.nullable().safeParse(value ?? null);
  if (!parsed.success || !parsed.data) return null;
  const profile = parsed.data;
  return {
    ...profile,
    about: plainOrNull(profile.about),
    description: plainOrNull(profile.description),
    strengths: profile.strengths.flatMap((item) => {
      const text = publicPlainText(item);
      return text.length > 0 ? [text] : [];
    }),
    risks: profile.risks.flatMap((item) => {
      const text = publicPlainText(item);
      return text.length > 0 ? [text] : [];
    }),
    promoters: profile.promoters.flatMap((item) => {
      const name = publicPlainText(item.name);
      if (name.length === 0) return [];
      return [{ name, profile: plainOrNull(item.profile) }];
    }),
    ...(profile.promoterNarrative !== undefined ? { promoterNarrative: plainOrNull(profile.promoterNarrative) } : {}),
    ...(profile.anchors
      ? {
          anchors: {
            ...profile.anchors,
            investors: profile.anchors.investors.flatMap((investor) => {
              const name = publicPlainText(investor.name);
              if (name.length === 0) return [];
              const group = investor.group === null ? null : publicPlainText(investor.group);
              return [{ ...investor, name, group: group && group.length > 0 ? group : null }];
            }),
          },
        }
      : {}),
    objectsOfIssue: {
      items: profile.objectsOfIssue.items.flatMap((item) => {
        const text = publicPlainText(item);
        return text.length > 0 ? [text] : [];
      }),
      text: plainOrNull(profile.objectsOfIssue.text),
    },
    sourceFinancials: {
      ...profile.sourceFinancials,
      unit: plainOrNull(profile.sourceFinancials.unit),
      text: plainOrNull(profile.sourceFinancials.text),
      headers: profile.sourceFinancials.headers.map((item) => publicPlainText(item)).filter((item) => item.length > 0),
      rows: profile.sourceFinancials.rows.flatMap((row) => {
        const metric = publicPlainText(row.metric);
        if (metric.length === 0) return [];
        return [{ metric, values: row.values.map((item) => (item === null ? null : publicPlainText(item) || null)) }];
      }),
    },
  };
}

function plainOrNull(value: string | null): string | null {
  if (value === null) return null;
  const text = publicPlainText(value);
  return text.length > 0 ? text : null;
}

function publicRegistrar(registrar: RegistrarRecord | null): Ipo["registrar"] {
  if (!registrar) return null;
  const name = publicPlainText(registrar.name);
  if (name.length === 0) return null;
  const statusPage = publicHttpUrl(registrar.allotmentUrl) ?? registrarPortalForName(name);
  const allotmentUrl = verifiedAllotmentUrl({ name, statusPage });
  return {
    name,
    websiteUrl: publicHttpUrl(registrar.websiteUrl),
    allotmentUrl,
  };
}

export function toIpo(input: {
  ipo: IpoRecord;
  company: CompanyRecord;
  gmp: readonly GmpObservationRecord[];
  subscription: readonly SubscriptionObservationRecord[];
  financials: readonly FinancialStatementRecord[];
  registrar: RegistrarRecord | null;
  documents: readonly SourceDocumentRecord[];
}): Ipo {
  const currentGmp = latest(input.gmp);
  const currentSubscription = latestSubscription(input.subscription);
  const today = istCalendarDate(catalogNow()) ?? "";
  const listingConfirmed = Boolean(
    input.ipo.listing &&
      ((typeof input.ipo.listing.listingPriceRupees === "number" && Number.isFinite(input.ipo.listing.listingPriceRupees)) ||
        input.ipo.status === "listed"),
  );
  const resolved = today
    ? resolveIpoLifecycle({
        today,
        openDate: input.ipo.dates.openDate,
        closeDate: input.ipo.dates.closeDate,
        allotmentDate: input.ipo.dates.allotmentDate,
        listingDate: input.ipo.dates.listingDate,
        providerStatus: input.ipo.status,
        listingConfirmed,
        allotmentConfirmed: input.ipo.allotmentConfirmed === true,
      })
    : null;
  const status = resolved && resolved.status !== "unknown" ? resolved.status : input.ipo.status;
  const candidate = {
    id: input.ipo.id,
    slug: input.ipo.slug,
    companyName: publicPlainText(input.company.name),
    board: input.ipo.board,
    status,
    ...(input.ipo.allotmentConfirmed === true ? { allotmentConfirmed: true as const } : {}),
    offer: {
      priceBand: {
        lowRupees: input.ipo.issue.priceBandLowRupees,
        highRupees: input.ipo.issue.priceBandHighRupees,
      },
      issuePriceRupees: input.ipo.issue.issuePriceRupees,
      issueSizeRupees: input.ipo.issue.issueSizeRupees,
      lotSizeShares: input.ipo.issue.lotSizeShares,
      minimumInvestmentRupees: input.ipo.issue.minimumInvestmentRupees,
    },
    dates: input.ipo.dates,
    gmp: gmpSnapshot(currentGmp),
    subscription: subscriptionSnapshot(currentSubscription),
    financials: input.financials.map((period) => ({
      fiscalYearLabel: period.fiscalYearLabel,
      revenueRupees: period.revenueRupees,
      profitAfterTaxRupees: period.profitAfterTaxRupees,
      earningsPerShareRupees: period.earningsPerShareRupees,
    })),
    registrar: publicRegistrar(input.registrar),
    documents: input.documents.flatMap((document) => {
      const url = publicHttpUrl(document.url);
      const title = publicPlainText(document.title);
      if (!url || title.length === 0) return [];
      return [{ kind: document.kind, title, url, publishedOn: document.publishedOn }];
    }),
    listing: input.ipo.listing,
    profile: publicProfile(input.ipo.profile),
    provenance: provenanceOf(input.ipo.source),
  };
  const parsed = ipoSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new HttpError(503, "unavailable", "A stored IPO could not be served.");
  }
  return parsed.data;
}

function storedName(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  return text.length > 0 && text.length <= 200 ? text : null;
}

export function toDirectoryRow(ipo: Ipo, symbol: string | null): DirectoryRow {
  const summary: IpoSummary = {
    id: ipo.id,
    slug: ipo.slug,
    companyName: ipo.companyName,
    board: ipo.board,
    status: ipo.status,
    openDate: ipo.dates.openDate,
    closeDate: ipo.dates.closeDate,
    gmpAmountRupees: ipo.gmp?.amountRupees ?? null,
    subscriptionTotalTimes: ipo.subscription?.totalTimes ?? null,
    provenance: ipo.provenance,
    priceBandLowRupees: ipo.offer.priceBand.lowRupees,
    priceBandHighRupees: ipo.offer.priceBand.highRupees,
    issuePriceRupees: ipo.offer.issuePriceRupees,
    lotSizeShares: ipo.offer.lotSizeShares,
    issueSizeRupees: ipo.offer.issueSizeRupees,
    gmpPercent: ipo.gmp?.percent ?? null,
    gmpObservedAt: ipo.gmp?.observedAt ?? null,
    ...(ipo.gmp ? { gmpFreshness: ipo.gmp.freshness } : {}),
    subscriptionObservedAt: ipo.subscription?.observedAt ?? null,
    ...(ipo.subscription ? { subscriptionFreshness: ipo.subscription.freshness } : {}),
    allotmentDate: ipo.dates.allotmentDate,
    listingDate: ipo.dates.listingDate,
    listingPriceRupees: ipo.listing?.listingPriceRupees ?? null,
    listingIssuePriceRupees: ipo.listing?.issuePriceRupees ?? null,
    registrarName: storedName(ipo.registrar?.name),
    allotmentUrl: ipo.registrar?.allotmentUrl ?? null,
    ...(ipo.allotmentConfirmed === true ? { allotmentConfirmed: true as const } : {}),
  };
  const parsed = directoryRowSchema.safeParse({
    summary,
    allotmentDate: ipo.dates.allotmentDate,
    listingDate: ipo.dates.listingDate,
    symbol,
  });
  if (!parsed.success) {
    throw new HttpError(503, "unavailable", "A stored IPO could not be served.");
  }
  return parsed.data;
}

export function gmpPayload(ipo: Ipo, rows: readonly GmpObservationRecord[]) {
  const current = latest(rows);
  return {
    ipoId: ipo.id,
    gmp: gmpSnapshot(current),
    provenance: current ? provenanceOf(current.source) : missingProvenance(ipo),
  };
}

export function gmpHistoryPayload(
  ipo: Ipo,
  rows: readonly GmpObservationRecord[],
  window: GmpHistoryWindowRecord | null = null,
): GmpHistory & { provenance: Provenance } {
  const current = latest(rows);
  return {
    ipoId: ipo.id,
    observations: [...rows]
      .sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime())
      .map((row) => ({
        observedAt: row.observedAt.toISOString(),
        observedOn: row.observedOn ?? null,
        amountRupees: row.amountRupees,
        percent: row.percent,
        session: row.session,
        slotLabel: row.slotLabel ?? null,
      })),
    window: historyWindow(window),
    provenance: current ? provenanceOf(current.source) : window ? provenanceOf(window.source) : missingProvenance(ipo),
  };
}

function historyWindow(window: GmpHistoryWindowRecord | null): GmpHistoryWindow {
  return {
    high: window?.highRupees !== null && window?.highRupees !== undefined && window.highOn ? { amountRupees: window.highRupees, observedOn: window.highOn } : null,
    low: window?.lowRupees !== null && window?.lowRupees !== undefined && window.lowOn ? { amountRupees: window.lowRupees, observedOn: window.lowOn } : null,
    truncated: window?.truncated ?? false,
    timelineLocked: window?.timelineLocked ?? false,
  };
}

export function subscriptionPayload(ipo: Ipo, rows: readonly SubscriptionObservationRecord[]) {
  const current = latestSubscription(rows);
  return {
    ipoId: ipo.id,
    subscription: subscriptionSnapshot(current),
    provenance: current ? provenanceOf(current.source) : missingProvenance(ipo),
  };
}

export function subscriptionHistoryPayload(
  ipo: Ipo,
  rows: readonly SubscriptionObservationRecord[],
): SubscriptionHistory & { provenance: Provenance } {
  const daily = rows.filter((row) => row.cadence !== "live");
  const current = latestSubscription(daily);
  return {
    ipoId: ipo.id,
    observations: [...daily]
      .sort((left, right) => subscriptionOrder(left) - subscriptionOrder(right))
      .flatMap((row) => {
        const snapshot = subscriptionSnapshot(row);
        return snapshot ? [snapshot] : [];
      }),
    provenance: current ? provenanceOf(current.source) : missingProvenance(ipo),
  };
}

export function financialsPayload(ipo: Ipo, source: SourceMetadataRecord | null) {
  return {
    ipoId: ipo.id,
    periods: ipo.financials,
    provenance: source ? provenanceOf(source) : missingProvenance(ipo),
  };
}

export function registrarPayload(ipo: Ipo, source: SourceMetadataRecord | null) {
  return {
    ipoId: ipo.id,
    registrar: ipo.registrar,
    provenance: source ? provenanceOf(source) : { ...ipo.provenance, freshness: "missing" as const },
    verification: "verify-before-use" as const,
  };
}
