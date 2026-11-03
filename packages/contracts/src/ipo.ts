import { z } from "zod";
import { ipoDatesSchema } from "./dates.ts";
import { sourceDocumentSchema } from "./documents.ts";
import { financialPeriodSchema } from "./financials.ts";
import { gmpSnapshotSchema } from "./gmp.ts";
import { listingPerformanceSchema } from "./listing.ts";
import { offerSchema } from "./offer.ts";
import {
  companyNameSchema,
  freshnessSchema,
  nullableHttpUrlSchema,
  nullableTimestampSchema,
  percentSchema,
  rupeeAmountSchema,
  shareCountSchema,
  slugSchema,
  stableIdSchema,
} from "./primitives.ts";
import { provenanceSchema } from "./provenance.ts";
import { ipoProfileSchema } from "./profile.ts";
import { registrarSchema } from "./registrar.ts";
import { boardSchema } from "./board.ts";
import { ipoStatusSchema } from "./status.ts";
import { subscriptionSnapshotSchema } from "./subscription.ts";

export const ipoIdentitySchema = z
  .object({
    id: stableIdSchema,
    slug: slugSchema,
    companyName: companyNameSchema,
  })
  .strict();

export const ipoSchema = ipoIdentitySchema
  .extend({
    board: boardSchema,
    /** Null when the lifecycle cannot be determined. Do not guess a status. */
    status: ipoStatusSchema.nullable(),
    offer: offerSchema,
    dates: ipoDatesSchema,
    gmp: gmpSnapshotSchema.nullable(),
    subscription: subscriptionSnapshotSchema.nullable(),
    financials: z.array(financialPeriodSchema),
    registrar: registrarSchema.nullable(),
    documents: z.array(sourceDocumentSchema),
    listing: listingPerformanceSchema.nullable(),
    profile: ipoProfileSchema.nullable().optional(),
    /** True only when a stored source confirms the allotment result. A passed date is not confirmation. */
    allotmentConfirmed: z.boolean().optional(),
    provenance: provenanceSchema,
  })
  .strict();

export const ipoSummarySchema = z
  .object({
    id: stableIdSchema,
    slug: slugSchema,
    companyName: companyNameSchema,
    board: boardSchema,
    status: ipoStatusSchema.nullable(),
    openDate: ipoDatesSchema.shape.openDate,
    closeDate: ipoDatesSchema.shape.closeDate,
    gmpAmountRupees: gmpSnapshotSchema.shape.amountRupees,
    subscriptionTotalTimes: subscriptionSnapshotSchema.shape.totalTimes,
    provenance: provenanceSchema,
    /** Optional catalogue facts already stored with the issue. Absent on older payloads. */
    priceBandLowRupees: rupeeAmountSchema.optional(),
    priceBandHighRupees: rupeeAmountSchema.optional(),
    issuePriceRupees: rupeeAmountSchema.optional(),
    lotSizeShares: shareCountSchema.optional(),
    issueSizeRupees: rupeeAmountSchema.optional(),
    gmpPercent: percentSchema.optional(),
    gmpObservedAt: nullableTimestampSchema.optional(),
    gmpFreshness: freshnessSchema.optional(),
    subscriptionObservedAt: nullableTimestampSchema.optional(),
    subscriptionFreshness: freshnessSchema.optional(),
    allotmentDate: ipoDatesSchema.shape.allotmentDate.optional(),
    listingDate: ipoDatesSchema.shape.listingDate.optional(),
    listingPriceRupees: z.number().finite().nonnegative().nullable().optional(),
    listingIssuePriceRupees: z.number().finite().nonnegative().nullable().optional(),
    registrarName: z.string().trim().min(1).max(200).nullable().optional(),
    allotmentUrl: nullableHttpUrlSchema.optional(),
    /** True only when a stored source confirms the allotment result. A passed date is not confirmation. */
    allotmentConfirmed: z.boolean().optional(),
  })
  .strict();

export type IpoIdentity = z.infer<typeof ipoIdentitySchema>;
export type Ipo = z.infer<typeof ipoSchema>;
export type IpoSummary = z.infer<typeof ipoSummarySchema>;
