import mongoose, { type Model } from "mongoose";
import type { z } from "zod";
import { PersistenceError } from "./persistence-error.ts";
import type { RetentionPolicy } from "./retention.ts";
import { retentionExpiry } from "./retention.ts";
import { catalogueReadLimit, type IpoCatalogueCounts, type PersistenceStore } from "./repositories.ts";
import {
  companyRecordSchema,
  financialStatementRecordSchema,
  gmpHistoryWindowRecordSchema,
  gmpObservationRecordSchema,
  ipoRecordSchema,
  providerUsageRecordSchema,
  registrarRecordSchema,
  sourceDocumentRecordSchema,
  subscriptionObservationRecordSchema,
  syncRunRecordSchema,
  type FinancialStatementRecord,
  type GmpHistoryWindowRecord,
  type GmpObservationRecord,
  type GmpObservationWrite,
  type IpoRecord,
  type ProviderUsageRecord,
  type ProviderUsageWrite,
  type RegistrarRecord,
  type SourceDocumentRecord,
  type SubscriptionObservationRecord,
  type SubscriptionObservationWrite,
  type SyncRunRecord,
  type SyncRunWrite,
} from "./records.ts";
import { CompanyModel } from "./models/company.ts";
import { FinancialStatementModel } from "./models/financial-statement.ts";
import { GmpHistoryWindowModel } from "./models/gmp-history-window.ts";
import { GmpObservationModel } from "./models/gmp-observation.ts";
import { IpoModel } from "./models/ipo.ts";
import { ProviderUsageModel } from "./models/provider-usage.ts";
import { RegistrarModel } from "./models/registrar.ts";
import { SourceDocumentModel } from "./models/source-document.ts";
import { SubscriptionObservationModel } from "./models/subscription-observation.ts";
import { SyncRunModel } from "./models/sync-run.ts";

type StoreModel = Model<Record<string, unknown>>;

function storeModel(model: object): StoreModel {
  return model as StoreModel;
}

function validationFields(error: z.ZodError): string {
  const fields = new Set<string>();
  for (const issue of error.issues) {
    const name = issue.path[0];
    fields.add(typeof name === "string" ? name : "record");
  }
  return [...fields].sort().join(", ");
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new PersistenceError(`Database validation failed: ${validationFields(parsed.error)}`);
  }
  return parsed.data;
}

function isDuplicateKey(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === 11000) return true;
  if ("cause" in error) return isDuplicateKey(error.cause);
  return false;
}

function rethrow(error: unknown): never {
  if (error instanceof PersistenceError) throw error;
  if (error instanceof mongoose.Error.ValidationError) {
    throw new PersistenceError(`Database validation failed: ${Object.keys(error.errors).sort().join(", ")}`);
  }
  if (error instanceof mongoose.Error.CastError) {
    throw new PersistenceError(`Database validation failed: ${error.path}`);
  }
  if (isDuplicateKey(error)) {
    throw new PersistenceError("A record with this identifier already exists.");
  }
  throw new PersistenceError("Database write failed.");
}

function withStableId(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const record = { ...(value as Record<string, unknown>) };
  if (typeof record._id === "string") record.id = record._id;
  delete record._id;
  delete record.__v;
  return record;
}

function withoutMongoId(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const record = { ...(value as Record<string, unknown>) };
  delete record._id;
  delete record.__v;
  return record;
}

function parseStored<T>(schema: z.ZodType<T>, value: unknown, stableId: boolean): T {
  const parsed = schema.safeParse(stableId ? withStableId(value) : withoutMongoId(value));
  if (!parsed.success) {
    throw new PersistenceError("Stored record did not match the database contract.");
  }
  return parsed.data;
}

const queryMaxTimeMs = 2_000;

async function upsertDocument(model: StoreModel, filter: Record<string, unknown>, set: Record<string, unknown>): Promise<unknown> {
  try {
    const document = await model
      .findOneAndUpdate(filter, { $set: set }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true })
      .maxTimeMS(queryMaxTimeMs)
      .lean();
    if (!document) throw new PersistenceError("Database write failed.");
    return document;
  } catch (error) {
    rethrow(error);
  }
}

async function findDocument(model: StoreModel, filter: Record<string, unknown>): Promise<unknown> {
  return model.findOne(filter).maxTimeMS(queryMaxTimeMs).lean();
}

async function findDocuments(model: StoreModel, filter: Record<string, unknown>, sort: Record<string, 1 | -1>): Promise<unknown[]> {
  return model.find(filter).maxTimeMS(queryMaxTimeMs).sort(sort).limit(catalogueReadLimit).lean();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function latestPerIpo(model: StoreModel, now: Date): Promise<unknown[]> {
  return model
    .aggregate([
      { $match: { expiresAt: { $gt: now } } },
      { $sort: { observedAt: -1 } },
      { $group: { _id: "$ipoId", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
      { $limit: catalogueReadLimit },
    ])
    .option({ maxTimeMS: queryMaxTimeMs });
}

async function summarizeIpoCounts(model: StoreModel): Promise<IpoCatalogueCounts> {
  const [total, groups] = await Promise.all([
    model.countDocuments({}).maxTimeMS(queryMaxTimeMs),
    model
      .aggregate<{ _id: { board: string | null; status: string | null }; count: number }>([
        { $group: { _id: { board: "$board", status: "$status" }, count: { $sum: 1 } } },
      ])
      .option({ maxTimeMS: queryMaxTimeMs }),
  ]);
  const counts: IpoCatalogueCounts = {
    total,
    mainboard: 0,
    sme: 0,
    open: 0,
    upcoming: 0,
    listed: 0,
    closed: 0,
    allotment: 0,
    statusMissing: 0,
    complete: total < catalogueReadLimit,
  };
  for (const group of groups) {
    const n = group.count;
    if (group._id.board === "mainboard") counts.mainboard += n;
    if (group._id.board === "sme") counts.sme += n;
    const status = group._id.status;
    if (status === null || status === undefined) counts.statusMissing += n;
    else if (status === "open" || status === "upcoming" || status === "listed" || status === "closed" || status === "allotment") {
      counts[status] += n;
    }
  }
  return counts;
}

function gmpRepository(gmp: StoreModel, retention: RetentionPolicy) {
  return {
    async upsert(input: GmpObservationWrite) {
      const record = gmpRecord(input, retention);
      const document = await upsertDocument(gmp, gmpKey(record), gmpUpdate(record));
      return parseStored(gmpObservationRecordSchema, document, false);
    },
    async findByIpo(ipoId: string, now = new Date()) {
      const documents = await findDocuments(gmp, { ipoId, expiresAt: { $gt: now } }, { observedAt: 1 });
      return documents.map((document) => parseStored(gmpObservationRecordSchema, document, false));
    },
    async findByIpos(ipoIds: readonly string[], now = new Date()) {
      if (ipoIds.length === 0) return [];
      const documents = await findDocuments(gmp, { ipoId: { $in: ipoIds.slice(0, 100) }, expiresAt: { $gt: now } }, { observedAt: -1 });
      return documents.map((document) => parseStored(gmpObservationRecordSchema, document, false));
    },
    async listCurrent(now = new Date()) {
      const documents = await findDocuments(gmp, { expiresAt: { $gt: now } }, { observedAt: -1 });
      return documents.map((document) => parseStored(gmpObservationRecordSchema, document, false));
    },
    async listLatest(now = new Date()) {
      const documents = await latestPerIpo(gmp, now);
      return documents.map((document) => parseStored(gmpObservationRecordSchema, document, false));
    },
  };
}

function subscriptionRepository(subscriptions: StoreModel, retention: RetentionPolicy) {
  return {
    async upsert(input: SubscriptionObservationWrite) {
      const record = subscriptionRecord(input, retention);
      const document = await upsertDocument(
        subscriptions,
        {
          ipoId: record.ipoId,
          cadence: record.cadence ?? null,
          observedOn: record.observedOn ?? null,
          observedAt: record.observedAt,
        },
        subscriptionUpdate(record),
      );
      return parseStored(subscriptionObservationRecordSchema, document, false);
    },
    async findByIpo(ipoId: string, now = new Date()) {
      const documents = await findDocuments(subscriptions, { ipoId, expiresAt: { $gt: now } }, { observedAt: 1 });
      return documents.map((document) => parseStored(subscriptionObservationRecordSchema, document, false));
    },
    async findByIpos(ipoIds: readonly string[], now = new Date()) {
      if (ipoIds.length === 0) return [];
      const documents = await findDocuments(subscriptions, { ipoId: { $in: ipoIds.slice(0, 100) }, expiresAt: { $gt: now } }, { observedAt: -1 });
      return documents.map((document) => parseStored(subscriptionObservationRecordSchema, document, false));
    },
    async listCurrent(now = new Date()) {
      const documents = await findDocuments(subscriptions, { expiresAt: { $gt: now } }, { observedAt: -1 });
      return documents.map((document) => parseStored(subscriptionObservationRecordSchema, document, false));
    },
    async listLatest(now = new Date()) {
      const documents = await latestPerIpo(subscriptions, now);
      return documents.map((document) => parseStored(subscriptionObservationRecordSchema, document, false));
    },
  };
}

function assertUniqueMappings(record: IpoRecord): void {
  const seen = new Set<string>();
  for (const mapping of record.providerMappings) {
    const key = `${mapping.providerKey}\u0000${mapping.externalId}`;
    if (seen.has(key)) throw new PersistenceError("Database validation failed: providerMappings");
    seen.add(key);
  }
}

export function createMongoStore(retention: RetentionPolicy): PersistenceStore {
  const companies = storeModel(CompanyModel);
  const ipos = storeModel(IpoModel);
  const gmp = storeModel(GmpObservationModel);
  const gmpWindows = storeModel(GmpHistoryWindowModel);
  const subscriptions = storeModel(SubscriptionObservationModel);
  const financials = storeModel(FinancialStatementModel);
  const registrars = storeModel(RegistrarModel);
  const sources = storeModel(SourceDocumentModel);
  const sync = storeModel(SyncRunModel);
  const usage = storeModel(ProviderUsageModel);

  return {
    companies: {
      async upsert(input) {
        const record = parseInput(companyRecordSchema, input);
        const document = await upsertDocument(companies, { _id: record.id }, { name: record.name, symbol: record.symbol ?? null, source: record.source });
        return parseStored(companyRecordSchema, document, true);
      },
      async findById(id) {
        const document = await findDocument(companies, { _id: id });
        return document ? parseStored(companyRecordSchema, document, true) : null;
      },
      async findByName(name) {
        const document = await findDocument(companies, { name });
        return document ? parseStored(companyRecordSchema, document, true) : null;
      },
      async list() {
        const documents = await companies.find({}).maxTimeMS(queryMaxTimeMs).sort({ name: 1 }).limit(catalogueReadLimit).lean();
        return documents.map((document) => parseStored(companyRecordSchema, document, true));
      },
    },
    ipos: {
      async upsert(input) {
        const record = parseInput(ipoRecordSchema, input);
        assertUniqueMappings(record);
        const document = await upsertDocument(ipos, { _id: record.id }, ipoUpdate(record));
        return parseStored(ipoRecordSchema, document, true);
      },
      async findById(id) {
        const document = await findDocument(ipos, { _id: id });
        return document ? parseStored(ipoRecordSchema, document, true) : null;
      },
      async findBySlug(slug) {
        const document = await findDocument(ipos, { slug });
        return document ? parseStored(ipoRecordSchema, document, true) : null;
      },
      async findByProvider(providerKey, externalId) {
        const document = await findDocument(ipos, {
          providerMappings: { $elemMatch: { providerKey, externalId } },
        });
        return document ? parseStored(ipoRecordSchema, document, true) : null;
      },
      async list() {
        const documents = await ipos.find({}).maxTimeMS(queryMaxTimeMs).sort({ slug: 1 }).limit(catalogueReadLimit).lean();
        return documents.map((document) => parseStored(ipoRecordSchema, document, true));
      },
      async summarizeCounts() {
        return summarizeIpoCounts(ipos);
      },
      async listForInspection(input) {
        const needle = input.query.trim().toLowerCase();
        const filter = needle.length > 0 ? { slug: { $regex: `^${escapeRegex(needle)}` } } : {};
        const limit = Math.min(Math.max(1, input.limit), 50);
        const documents = await ipos.find(filter).maxTimeMS(queryMaxTimeMs).sort({ slug: 1 }).limit(limit).lean();
        return documents.map((document) => parseStored(ipoRecordSchema, document, true));
      },
    },
    gmp: gmpRepository(gmp, retention),
    gmpWindows: {
      async upsert(input) {
        const record = parseInput(gmpHistoryWindowRecordSchema, input);
        const document = await upsertDocument(gmpWindows, { _id: record.ipoId }, windowUpdate(record));
        return parseStored(gmpHistoryWindowRecordSchema, document, false);
      },
      async findByIpo(ipoId) {
        const document = await findDocument(gmpWindows, { ipoId });
        return document ? parseStored(gmpHistoryWindowRecordSchema, document, false) : null;
      },
    },
    subscriptions: subscriptionRepository(subscriptions, retention),
    financials: {
      async upsert(input) {
        const record = parseInput(financialStatementRecordSchema, input);
        const document = await upsertDocument(
          financials,
          { companyId: record.companyId, fiscalYearLabel: record.fiscalYearLabel },
          financialUpdate(record),
        );
        return parseStored(financialStatementRecordSchema, document, false);
      },
      async findByCompany(companyId) {
        const documents = await findDocuments(financials, { companyId }, { fiscalYearLabel: 1 });
        return documents.map((document) => parseStored(financialStatementRecordSchema, document, false));
      },
    },
    registrars: {
      async upsert(input) {
        const record = parseInput(registrarRecordSchema, input);
        const document = await upsertDocument(registrars, { _id: record.id }, registrarUpdate(record));
        return parseStored(registrarRecordSchema, document, true);
      },
      async findById(id) {
        const document = await findDocument(registrars, { _id: id });
        return document ? parseStored(registrarRecordSchema, document, true) : null;
      },
      async findByIds(ids) {
        const unique = [...new Set(ids.filter((id) => id.length > 0))].slice(0, catalogueReadLimit);
        if (unique.length === 0) return [];
        const documents = await findDocuments(registrars, { _id: { $in: unique } }, { name: 1 });
        return documents.map((document) => parseStored(registrarRecordSchema, document, true));
      },
    },
    sources: {
      async upsert(input) {
        const record = parseInput(sourceDocumentRecordSchema, input);
        const document = await upsertDocument(sources, { ipoId: record.ipoId, kind: record.kind, url: record.url }, sourceUpdate(record));
        return parseStored(sourceDocumentRecordSchema, document, false);
      },
      async findByIpo(ipoId) {
        const documents = await findDocuments(sources, { ipoId }, { kind: 1 });
        return documents.map((document) => parseStored(sourceDocumentRecordSchema, document, false));
      },
    },
    sync: {
      async upsert(input) {
        const record = syncRecord(input, retention);
        const document = await upsertDocument(
          sync,
          { providerKey: record.providerKey, resource: record.resource, startedAt: record.startedAt },
          syncUpdate(record),
        );
        return parseStored(syncRunRecordSchema, document, false);
      },
      async findByProvider(providerKey, now = new Date()) {
        const documents = await findDocuments(sync, { providerKey, expiresAt: { $gt: now } }, { startedAt: -1 });
        return documents.map((document) => parseStored(syncRunRecordSchema, document, false));
      },
    },
    usage: {
      async upsert(input) {
        const record = usageRecord(input, retention);
        const document = await upsertDocument(usage, { providerKey: record.providerKey, usageId: record.usageId }, usageUpdate(record));
        return parseStored(providerUsageRecordSchema, document, false);
      },
      async findByProvider(providerKey, now = new Date()) {
        const documents = await findDocuments(usage, { providerKey, expiresAt: { $gt: now } }, { requestedAt: -1 });
        return documents.map((document) => parseStored(providerUsageRecordSchema, document, false));
      },
    },
  };
}

function gmpRecord(input: GmpObservationWrite, retention: RetentionPolicy): GmpObservationRecord {
  const parsed = parseInput(gmpObservationRecordSchema.omit({ expiresAt: true }), input);
  return { ...parsed, expiresAt: retentionExpiry(parsed.source.fetchedAt, retention.gmpDays) };
}

function subscriptionRecord(input: SubscriptionObservationWrite, retention: RetentionPolicy): SubscriptionObservationRecord {
  const parsed = parseInput(subscriptionObservationRecordSchema.omit({ expiresAt: true }), input);
  return { ...parsed, expiresAt: retentionExpiry(parsed.source.fetchedAt, retention.subscriptionDays) };
}

function syncRecord(input: SyncRunWrite, retention: RetentionPolicy): SyncRunRecord {
  const parsed = parseInput(syncRunRecordSchema.omit({ expiresAt: true }), input);
  return { ...parsed, expiresAt: retentionExpiry(parsed.startedAt, retention.syncHistoryDays) };
}

function usageRecord(input: ProviderUsageWrite, retention: RetentionPolicy): ProviderUsageRecord {
  const parsed = parseInput(providerUsageRecordSchema.omit({ expiresAt: true }), input);
  return {
    ...parsed,
    durationMs: parsed.durationMs ?? null,
    expiresAt: retentionExpiry(parsed.requestedAt, retention.providerUsageDays),
  };
}

function gmpKey(record: GmpObservationRecord): Record<string, unknown> {
  return { ipoId: record.ipoId, observedAt: record.observedAt, session: record.session };
}

function ipoUpdate(record: IpoRecord): Record<string, unknown> {
  return {
    slug: record.slug,
    companyId: record.companyId,
    board: record.board,
    status: record.status,
    issue: record.issue,
    dates: record.dates,
    listing: record.listing,
    registrarId: record.registrarId,
    providerMappings: record.providerMappings,
    ...(record.profile !== undefined ? { profile: record.profile } : {}),
    ...(record.allotmentConfirmed !== undefined ? { allotmentConfirmed: record.allotmentConfirmed } : {}),
    ...(record.allotmentConfirmedAt !== undefined ? { allotmentConfirmedAt: record.allotmentConfirmedAt } : {}),
    source: record.source,
  };
}

function gmpUpdate(record: GmpObservationRecord): Record<string, unknown> {
  return {
    observedOn: record.observedOn ?? null,
    amountRupees: record.amountRupees,
    percent: record.percent,
    indicativeImpliedPriceRupees: record.indicativeImpliedPriceRupees,
    slotLabel: record.slotLabel ?? null,
    source: record.source,
    expiresAt: record.expiresAt,
  };
}

function windowUpdate(record: GmpHistoryWindowRecord): Record<string, unknown> {
  return {
    ipoId: record.ipoId,
    highRupees: record.highRupees,
    highOn: record.highOn,
    lowRupees: record.lowRupees,
    lowOn: record.lowOn,
    truncated: record.truncated,
    timelineLocked: record.timelineLocked,
    source: record.source,
  };
}

function subscriptionUpdate(record: SubscriptionObservationRecord): Record<string, unknown> {
  return {
    observedOn: record.observedOn ?? null,
    biddingDay: record.biddingDay ?? null,
    cadence: record.cadence ?? null,
    retailTimes: record.retailTimes,
    qibTimes: record.qibTimes,
    niiTimes: record.niiTimes,
    employeeTimes: record.employeeTimes,
    shareholderTimes: record.shareholderTimes ?? null,
    anchorTimes: record.anchorTimes ?? null,
    categories: record.categories ?? [],
    totalTimes: record.totalTimes,
    source: record.source,
    expiresAt: record.expiresAt,
  };
}

function financialUpdate(record: FinancialStatementRecord): Record<string, unknown> {
  return {
    revenueRupees: record.revenueRupees,
    profitAfterTaxRupees: record.profitAfterTaxRupees,
    earningsPerShareRupees: record.earningsPerShareRupees,
    source: record.source,
  };
}

function registrarUpdate(record: RegistrarRecord): Record<string, unknown> {
  return {
    name: record.name,
    websiteUrl: record.websiteUrl,
    allotmentUrl: record.allotmentUrl,
    source: record.source,
  };
}

function sourceUpdate(record: SourceDocumentRecord): Record<string, unknown> {
  return {
    title: record.title,
    publishedOn: record.publishedOn,
    source: record.source,
  };
}

function syncUpdate(record: SyncRunRecord): Record<string, unknown> {
  return {
    finishedAt: record.finishedAt,
    status: record.status,
    fetchedCount: record.fetchedCount,
    errorName: record.errorName,
    expiresAt: record.expiresAt,
  };
}

function usageUpdate(record: ProviderUsageRecord): Record<string, unknown> {
  return {
    endpoint: record.endpoint,
    requestedAt: record.requestedAt,
    statusCode: record.statusCode,
    durationMs: record.durationMs,
    expiresAt: record.expiresAt,
  };
}
