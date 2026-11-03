import type { FinancialPeriod, GmpHistory, GmpSnapshot, Ipo, IpoProfile, Provenance, SubscriptionHistory, SubscriptionSnapshot } from "@ipo-singh/contracts";
import { ipoProfileSchema } from "@ipo-singh/contracts";
import { resolveFreshness } from "@ipo-singh/core";
import type { ProviderKey } from "../providers/provider.ts";
import { publicHttpUrl, publicPlainText } from "../shared/public-text.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import type { MappedGmpHistory } from "../providers/ipo-guru/history.ts";
import type { MappedIpoDetail } from "../providers/ipo-guru/detail.ts";
import { mergeIpoProfile } from "../providers/ipo-guru/detail.ts";
import type { MappedSubscription } from "../providers/ipo-guru/subscription.ts";
import {
  companyRecordSchema,
  financialStatementRecordSchema,
  gmpHistoryWindowRecordSchema,
  gmpObservationRecordSchema,
  ipoRecordSchema,
  registrarRecordSchema,
  sourceDocumentRecordSchema,
  subscriptionObservationRecordSchema,
  type SourceMetadataRecord,
} from "../db/records.ts";

export class SyncRejectedError extends Error {
  constructor() {
    super("Incoming IPO data failed validation.");
    this.name = "SyncRejectedError";
  }
}

function sourceFrom(provenance: Provenance, now: Date, sourceUpdatedAt: Date | null = null): SourceMetadataRecord {
  const fetchedAt = provenance.retrievedAt ? new Date(provenance.retrievedAt) : now;
  if (Number.isNaN(fetchedAt.getTime())) throw new SyncRejectedError();
  return {
    source: provenance.sourceName,
    fetchedAt,
    sourceUpdatedAt,
    freshness: provenance.freshness,
  };
}

function registrarIdFor(ipoId: string): string | null {
  const candidate = `registrar-${ipoId}`;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate) && candidate.length <= 80 ? candidate : null;
}

export async function persistCatalogIpo(
  store: PersistenceStore,
  ipo: Ipo,
  providerKey: ProviderKey,
  now: Date,
  options?: { externalId?: string },
): Promise<number> {
  const externalId = options?.externalId ?? ipo.id;
  const mapped = await store.ipos.findByProvider(providerKey, externalId);
  const bySlug = await store.ipos.findBySlug(ipo.slug);
  if (mapped && bySlug && mapped.id !== bySlug.id) throw new SyncRejectedError();
  const stable = mapped ?? bySlug;
  const id = stable?.id ?? ipo.id;
  const companyId = stable?.companyId ?? id;
  const observed = ipo.gmp?.observedAt ? new Date(ipo.gmp.observedAt) : null;
  const sourceUpdatedAt = observed && !Number.isNaN(observed.getTime()) ? observed : null;
  const source = sourceFrom(
    sourceUpdatedAt ? { ...ipo.provenance, freshness: resolveFreshness(sourceUpdatedAt, now) } : ipo.provenance,
    now,
    sourceUpdatedAt,
  );
  const existingCompany = await store.companies.findById(companyId);
  const company = companyRecordSchema.safeParse({
    id: companyId,
    name: publicPlainText(ipo.companyName),
    symbol: existingCompany?.symbol ?? null,
    source,
  });
  const registrarId = ipo.registrar?.name ? registrarIdFor(id) : (stable?.registrarId ?? null);
  const previousMappings = stable?.providerMappings ?? [];
  const record = ipoRecordSchema.safeParse({
    id,
    slug: ipo.slug,
    companyId,
    board: ipo.board,
    status: ipo.status,
    issue: {
      priceBandLowRupees: ipo.offer.priceBand.lowRupees,
      priceBandHighRupees: ipo.offer.priceBand.highRupees,
      issuePriceRupees: ipo.offer.issuePriceRupees,
      issueSizeRupees: ipo.offer.issueSizeRupees,
      lotSizeShares: ipo.offer.lotSizeShares,
      minimumInvestmentRupees: ipo.offer.minimumInvestmentRupees,
    },
    dates: ipo.dates,
    listing: ipo.listing,
    registrarId,
    providerMappings: [...previousMappings.filter((item) => item.providerKey !== providerKey), { providerKey, externalId }],
    source,
  });
  if (!company.success || !record.success) throw new SyncRejectedError();

  let writes = 0;
  await store.companies.upsert(company.data);
  writes += 1;
  await store.ipos.upsert(record.data);
  writes += 1;

  if (ipo.registrar?.name && registrarId) {
    const registrar = registrarRecordSchema.safeParse({
      id: registrarId,
      name: publicPlainText(ipo.registrar.name),
      websiteUrl: publicHttpUrl(ipo.registrar.websiteUrl),
      allotmentUrl: publicHttpUrl(ipo.registrar.allotmentUrl),
      source,
    });
    if (!registrar.success) throw new SyncRejectedError();
    await store.registrars.upsert(registrar.data);
    writes += 1;
  }

  for (const document of ipo.documents) {
    const url = publicHttpUrl(document.url);
    const title = publicPlainText(document.title);
    if (!url || title.length === 0) continue;
    const stored = sourceDocumentRecordSchema.safeParse({
      ipoId: id,
      kind: document.kind,
      title,
      url,
      publishedOn: document.publishedOn,
      source,
    });
    if (!stored.success) throw new SyncRejectedError();
    await store.sources.upsert(stored.data);
    writes += 1;
  }
  if (ipo.gmp?.observedAt) {
    writes += await persistCurrentGmp(store, id, ipo.gmp, { ...ipo.provenance, freshness: ipo.gmp.freshness }, now);
  }
  return writes;
}

/** Stores one IPO detail document. A Free plan omits the company block and leaves the last narrative in place. */
export async function persistMappedIpoDetail(
  store: PersistenceStore,
  detail: MappedIpoDetail,
  providerKey: ProviderKey,
  now: Date,
): Promise<number> {
  const existing = await store.ipos.findBySlug(detail.ipo.slug);
  const previous = ipoProfileSchema.nullable().safeParse(existing?.profile ?? null);
  const writes = await persistCatalogIpo(store, detail.ipo, providerKey, now);
  const stored = await store.ipos.findBySlug(detail.ipo.slug);
  if (!stored) throw new SyncRejectedError();
  const profile: IpoProfile = mergeIpoProfile(previous.success ? previous.data : null, detail.profile, detail.companyPresent);
  const parsed = ipoProfileSchema.safeParse(profile);
  if (!parsed.success) throw new SyncRejectedError();
  await store.ipos.upsert({ ...stored, profile: parsed.data });
  return writes + 1;
}

export async function persistCurrentGmp(store: PersistenceStore, ipoId: string, gmp: GmpSnapshot, provenance: Provenance, now: Date): Promise<number> {
  if (!gmp.observedAt) throw new SyncRejectedError();
  const observedAt = new Date(gmp.observedAt);
  const record = gmpObservationRecordSchema.omit({ expiresAt: true }).safeParse({
    ipoId,
    observedAt,
    session: "daily",
    amountRupees: gmp.amountRupees,
    percent: gmp.percent,
    indicativeImpliedPriceRupees: gmp.indicativeImpliedPriceRupees,
    source: sourceFrom({ ...provenance, freshness: gmp.freshness }, now, observedAt),
  });
  if (!record.success) throw new SyncRejectedError();
  await store.gmp.upsert(record.data);
  return 1;
}

export async function persistCurrentSubscription(
  store: PersistenceStore,
  ipoId: string,
  snapshot: SubscriptionSnapshot,
  provenance: Provenance,
  now: Date,
): Promise<number> {
  if (!snapshot.observedAt) throw new SyncRejectedError();
  const record = subscriptionObservationRecordSchema.omit({ expiresAt: true }).safeParse({
    ipoId,
    observedAt: new Date(snapshot.observedAt),
    observedOn: snapshot.observedOn ?? null,
    biddingDay: snapshot.biddingDay ?? null,
    cadence: "live",
    retailTimes: snapshot.retailTimes,
    qibTimes: snapshot.qibTimes,
    niiTimes: snapshot.niiTimes,
    employeeTimes: snapshot.employeeTimes,
    shareholderTimes: snapshot.shareholderTimes ?? null,
    anchorTimes: snapshot.anchorTimes ?? null,
    categories: snapshot.categories ?? [],
    totalTimes: snapshot.totalTimes,
    source: sourceFrom({ ...provenance, freshness: snapshot.freshness }, now, new Date(snapshot.observedAt)),
  });
  if (!record.success) throw new SyncRejectedError();
  await store.subscriptions.upsert(record.data);
  return 1;
}

export async function persistFinancials(
  store: PersistenceStore,
  companyId: string,
  periods: readonly FinancialPeriod[],
  provenance: Provenance,
  now: Date,
): Promise<number> {
  const source = sourceFrom(provenance, now);
  const records = periods.map((period) => {
    const parsed = financialStatementRecordSchema.safeParse({
      companyId,
      fiscalYearLabel: period.fiscalYearLabel,
      revenueRupees: period.revenueRupees,
      profitAfterTaxRupees: period.profitAfterTaxRupees,
      earningsPerShareRupees: period.earningsPerShareRupees,
      source,
    });
    if (!parsed.success) throw new SyncRejectedError();
    return parsed.data;
  });
  for (const record of records) await store.financials.upsert(record);
  return records.length;
}

export async function persistHistory(
  store: PersistenceStore,
  ipoId: string,
  gmp: GmpHistory,
  subscription: SubscriptionHistory,
  provenance: Provenance,
  now: Date,
): Promise<number> {
  const source = sourceFrom(provenance, now);
  const gmpRows = gmp.observations.map((row) => {
    const parsed = gmpObservationRecordSchema.omit({ expiresAt: true }).safeParse({
      ipoId,
      observedAt: new Date(row.observedAt),
      session: row.session,
      amountRupees: row.amountRupees,
      percent: row.percent,
      indicativeImpliedPriceRupees: null,
      source,
    });
    if (!parsed.success) throw new SyncRejectedError();
    return parsed.data;
  });
  const subscriptionRows = subscription.observations.map((row) => {
    if (!row.observedAt) throw new SyncRejectedError();
    const parsed = subscriptionObservationRecordSchema.omit({ expiresAt: true }).safeParse({
      ipoId,
      observedAt: new Date(row.observedAt),
      observedOn: row.observedOn ?? null,
      biddingDay: row.biddingDay ?? null,
      cadence: "daily",
      retailTimes: row.retailTimes,
      qibTimes: row.qibTimes,
      niiTimes: row.niiTimes,
      employeeTimes: row.employeeTimes,
      shareholderTimes: row.shareholderTimes ?? null,
      anchorTimes: row.anchorTimes ?? null,
      categories: row.categories ?? [],
      totalTimes: row.totalTimes,
      source: sourceFrom({ ...provenance, freshness: row.freshness }, now, new Date(row.observedAt)),
    });
    if (!parsed.success) throw new SyncRejectedError();
    return parsed.data;
  });
  for (const row of gmpRows) await store.gmp.upsert(row);
  for (const row of subscriptionRows) await store.subscriptions.upsert(row);
  return gmpRows.length + subscriptionRows.length;
}

/** Stores IPO Guru subscription readings. `live` is the current poll. `daily` is the day-wise history. */
export async function persistMappedSubscription(
  store: PersistenceStore,
  ipoId: string,
  series: MappedSubscription,
  cadence: "live" | "daily",
  now: Date,
): Promise<number> {
  const rows = series.observations.map((row) => {
    if (!row.observedAt && !row.observedOn) throw new SyncRejectedError();
    const observedAt = row.observedAt ? new Date(row.observedAt) : null;
    if (row.observedAt && (observedAt === null || Number.isNaN(observedAt.getTime()))) throw new SyncRejectedError();
    const parsed = subscriptionObservationRecordSchema.omit({ expiresAt: true }).safeParse({
      ipoId,
      observedAt,
      observedOn: row.observedOn ?? null,
      biddingDay: row.biddingDay ?? null,
      cadence,
      retailTimes: row.retailTimes,
      qibTimes: row.qibTimes,
      niiTimes: row.niiTimes,
      employeeTimes: row.employeeTimes,
      shareholderTimes: row.shareholderTimes ?? null,
      anchorTimes: row.anchorTimes ?? null,
      categories: row.categories ?? [],
      totalTimes: row.totalTimes,
      source: sourceFrom(
        { sourceName: "IPO Guru Pro", retrievedAt: now.toISOString(), freshness: row.freshness },
        now,
        observedAt,
      ),
    });
    if (!parsed.success) throw new SyncRejectedError();
    return parsed.data;
  });
  for (const row of rows) await store.subscriptions.upsert(row);
  return rows.length;
}

/** Stores one IPO Guru GMP history document. It does not write subscription history. */
export async function persistMappedGmpHistory(
  store: PersistenceStore,
  ipoId: string,
  series: MappedGmpHistory,
  now: Date,
): Promise<number> {
  const source = sourceFrom(
    { sourceName: "IPO Guru Pro", retrievedAt: now.toISOString(), freshness: "fresh" },
    now,
    series.sourceUpdatedAt ? new Date(series.sourceUpdatedAt) : null,
  );
  const rows = series.observations.map((row) => {
    const parsed = gmpObservationRecordSchema.omit({ expiresAt: true }).safeParse({
      ipoId,
      observedAt: new Date(row.observedAt),
      observedOn: row.observedOn ?? null,
      session: row.session,
      amountRupees: row.amountRupees,
      percent: row.percent,
      indicativeImpliedPriceRupees: null,
      slotLabel: row.slotLabel ?? null,
      source,
    });
    if (!parsed.success) throw new SyncRejectedError();
    return parsed.data;
  });
  const window = gmpHistoryWindowRecordSchema.safeParse({
    ipoId,
    highRupees: series.window.high?.amountRupees ?? null,
    highOn: series.window.high?.observedOn ?? null,
    lowRupees: series.window.low?.amountRupees ?? null,
    lowOn: series.window.low?.observedOn ?? null,
    truncated: series.window.truncated,
    timelineLocked: series.window.timelineLocked,
    source,
  });
  if (!window.success) throw new SyncRejectedError();
  for (const row of rows) await store.gmp.upsert(row);
  if (!store.gmpWindows) throw new SyncRejectedError();
  await store.gmpWindows.upsert(window.data);
  return rows.length;
}
