import {
  boardSchema,
  ipoProfileSchema,
  companyNameSchema,
  documentKindSchema,
  freshnessSchema,
  ipoStatusSchema,
  isoDateSchema,
  slugSchema,
  stableIdSchema,
} from "@ipo-singh/contracts";
import { z } from "zod";

const nullableCalendarDate = isoDateSchema.nullable();
const nullableAmount = z.number().finite().nullable();
const nullableNonNegative = z.number().finite().nonnegative().nullable();
const nullableCount = z.number().int().nonnegative().nullable();

export const sourceMetadataRecordSchema = z
  .object({
    source: z.string().trim().min(1).max(80),
    fetchedAt: z.date(),
    sourceUpdatedAt: z.date().nullable(),
    freshness: freshnessSchema,
  })
  .strict();

export const providerMappingRecordSchema = z
  .object({
    providerKey: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40),
    externalId: z.string().trim().regex(/^[A-Za-z0-9:_-]{1,120}$/),
  })
  .strict();

export const companyRecordSchema = z
  .object({
    id: stableIdSchema,
    name: companyNameSchema,
    /** Present only when a stored company has a trading symbol. Missing means the symbol was not supplied. */
    symbol: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,39}$/)
      .nullable()
      .optional(),
    source: sourceMetadataRecordSchema,
  })
  .strict();

export const issueRecordSchema = z
  .object({
    priceBandLowRupees: nullableNonNegative,
    priceBandHighRupees: nullableNonNegative,
    issuePriceRupees: nullableNonNegative,
    issueSizeRupees: nullableAmount,
    lotSizeShares: nullableCount,
    minimumInvestmentRupees: nullableAmount,
  })
  .strict();

export const issueDatesRecordSchema = z
  .object({
    openDate: nullableCalendarDate,
    closeDate: nullableCalendarDate,
    allotmentDate: nullableCalendarDate,
    listingDate: nullableCalendarDate,
  })
  .strict();

export const listingRecordSchema = z
  .object({
    issuePriceRupees: nullableNonNegative,
    listingPriceRupees: nullableNonNegative,
    gainPercent: nullableAmount,
    listedOn: nullableCalendarDate,
  })
  .strict();

export const ipoRecordSchema = z
  .object({
    id: stableIdSchema,
    slug: slugSchema,
    companyId: stableIdSchema,
    board: boardSchema,
    status: ipoStatusSchema.nullable(),
    issue: issueRecordSchema,
    dates: issueDatesRecordSchema,
    listing: listingRecordSchema.nullable(),
    registrarId: stableIdSchema.nullable(),
    providerMappings: z.array(providerMappingRecordSchema).max(10),
    profile: ipoProfileSchema.nullable().optional(),
    /** True only after verified registrar evidence or audited admin confirmation. */
    allotmentConfirmed: z.boolean().optional(),
    /** Instant when allotmentConfirmed became true. */
    allotmentConfirmedAt: z.date().optional(),
    source: sourceMetadataRecordSchema,
  })
  .strict();

export const gmpObservationRecordSchema = z
  .object({
    ipoId: stableIdSchema,
    observedAt: z.date(),
    observedOn: nullableCalendarDate.optional(),
    session: z.enum(["daily", "intraday"]),
    amountRupees: nullableAmount,
    percent: nullableAmount,
    indicativeImpliedPriceRupees: nullableAmount,
    slotLabel: z.string().trim().min(1).max(40).nullable().optional(),
    source: sourceMetadataRecordSchema,
    expiresAt: z.date(),
  })
  .strict();

export const gmpHistoryWindowRecordSchema = z
  .object({
    ipoId: stableIdSchema,
    highRupees: nullableAmount,
    highOn: nullableCalendarDate,
    lowRupees: nullableAmount,
    lowOn: nullableCalendarDate,
    truncated: z.boolean(),
    timelineLocked: z.boolean(),
    source: sourceMetadataRecordSchema,
  })
  .strict();

const subscriptionSubcategoryRecordSchema = z
  .object({
    key: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,31}$/),
    times: nullableNonNegative,
  })
  .strict();

const subscriptionCategoryRecordSchema = z
  .object({
    key: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,31}$/),
    times: nullableNonNegative,
    subcategories: z.array(subscriptionSubcategoryRecordSchema).max(24),
  })
  .strict();

export const subscriptionObservationRecordSchema = z
  .object({
    ipoId: stableIdSchema,
    observedAt: z.date().nullable(),
    observedOn: nullableCalendarDate.optional(),
    biddingDay: nullableCount.optional(),
    /** `live` is the current poll. `daily` is one bidding-day snapshot. Older rows omit it and stay in both views. */
    cadence: z.enum(["live", "daily"]).nullable().optional(),
    retailTimes: nullableNonNegative,
    qibTimes: nullableNonNegative,
    niiTimes: nullableNonNegative,
    employeeTimes: nullableNonNegative,
    shareholderTimes: nullableNonNegative.optional(),
    anchorTimes: nullableNonNegative.optional(),
    categories: z.array(subscriptionCategoryRecordSchema).max(24).optional(),
    totalTimes: nullableNonNegative,
    source: sourceMetadataRecordSchema,
    expiresAt: z.date(),
  })
  .strict();

export const financialStatementRecordSchema = z
  .object({
    companyId: stableIdSchema,
    fiscalYearLabel: z.string().trim().min(1).max(20),
    revenueRupees: nullableAmount,
    profitAfterTaxRupees: nullableAmount,
    earningsPerShareRupees: nullableAmount,
    source: sourceMetadataRecordSchema,
  })
  .strict();

export const registrarRecordSchema = z
  .object({
    id: stableIdSchema,
    name: z.string().trim().min(1).max(200),
    websiteUrl: z.string().url().max(2000).nullable(),
    allotmentUrl: z.string().url().max(2000).nullable(),
    source: sourceMetadataRecordSchema,
  })
  .strict();

export const sourceDocumentRecordSchema = z
  .object({
    ipoId: stableIdSchema,
    kind: documentKindSchema,
    title: z.string().trim().min(1).max(200),
    url: z.string().url().max(2000),
    publishedOn: nullableCalendarDate,
    source: sourceMetadataRecordSchema,
  })
  .strict();

export const syncRunRecordSchema = z
  .object({
    providerKey: providerMappingRecordSchema.shape.providerKey,
    resource: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40),
    startedAt: z.date(),
    finishedAt: z.date().nullable(),
    status: z.enum(["running", "succeeded", "failed"]),
    fetchedCount: z.number().int().nonnegative(),
    errorName: z.string().trim().min(1).max(80).nullable(),
    expiresAt: z.date(),
  })
  .strict();

export const providerUsageRecordSchema = z
  .object({
    providerKey: providerMappingRecordSchema.shape.providerKey,
    endpoint: z.string().regex(/^\/[A-Za-z0-9/._-]{0,199}$/),
    usageId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,80}$/),
    requestedAt: z.date(),
    statusCode: z.number().int().min(0).max(599),
    durationMs: z.number().int().min(0).max(120_000).nullable(),
    expiresAt: z.date(),
  })
  .strict();

export type SourceMetadataRecord = z.infer<typeof sourceMetadataRecordSchema>;
export type CompanyRecord = z.infer<typeof companyRecordSchema>;
export type IpoRecord = z.infer<typeof ipoRecordSchema>;
export type GmpObservationRecord = z.infer<typeof gmpObservationRecordSchema>;
export type GmpHistoryWindowRecord = z.infer<typeof gmpHistoryWindowRecordSchema>;
export type SubscriptionObservationRecord = z.infer<typeof subscriptionObservationRecordSchema>;
export type FinancialStatementRecord = z.infer<typeof financialStatementRecordSchema>;
export type RegistrarRecord = z.infer<typeof registrarRecordSchema>;
export type SourceDocumentRecord = z.infer<typeof sourceDocumentRecordSchema>;
export type SyncRunRecord = z.infer<typeof syncRunRecordSchema>;
export type ProviderUsageRecord = z.infer<typeof providerUsageRecordSchema>;

export type GmpObservationWrite = Omit<GmpObservationRecord, "expiresAt">;
export type SubscriptionObservationWrite = Omit<SubscriptionObservationRecord, "expiresAt">;
export type SyncRunWrite = Omit<SyncRunRecord, "expiresAt">;
export type ProviderUsageWrite = Omit<ProviderUsageRecord, "expiresAt">;
