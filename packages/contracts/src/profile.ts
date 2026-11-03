import { z } from "zod";
import { nullableIsoDateSchema, percentSchema, shareCountSchema } from "./primitives.ts";

const narrativeSchema = z.string().trim().min(1).max(4_000);
const shortTextSchema = z.string().trim().min(1).max(500);

export const ipoPromoterSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    profile: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict();

export const sourceFinancialRowSchema = z
  .object({
    metric: z.string().trim().min(1).max(120),
    values: z.array(z.string().trim().max(40).nullable()).max(12),
  })
  .strict();

export const sourceFinancialsSchema = z
  .object({
    unit: z.string().trim().min(1).max(40).nullable(),
    headers: z.array(z.string().trim().min(1).max(40)).max(12),
    rows: z.array(sourceFinancialRowSchema).max(40),
    text: narrativeSchema.nullable(),
  })
  .strict();

export const ipoAnchorInvestorSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    group: z.string().trim().min(1).max(200).nullable(),
    shares: shareCountSchema,
    amountCrore: z.number().finite().nonnegative().nullable(),
    allocatedPercent: percentSchema,
    issuePercent: percentSchema,
  })
  .strict();

export const ipoAnchorsSchema = z
  .object({
    totalCount: z.number().int().nonnegative().nullable(),
    totalAmountCrore: z.number().finite().nonnegative().nullable(),
    mutualFundCount: z.number().int().nonnegative().nullable(),
    investors: z.array(ipoAnchorInvestorSchema).max(400),
  })
  .strict();

export const objectsOfIssueSchema = z
  .object({
    items: z.array(shortTextSchema).max(40),
    text: narrativeSchema.nullable(),
  })
  .strict();

/** Editorial and source-shaped detail from one IPO document. Absent on older stored issues. */
export const ipoProfileSchema = z
  .object({
    refundDate: nullableIsoDateSchema,
    dematCreditDate: nullableIsoDateSchema,
    about: narrativeSchema.nullable(),
    description: narrativeSchema.nullable(),
    strengths: z.array(shortTextSchema).max(40),
    risks: z.array(shortTextSchema).max(40),
    promoters: z.array(ipoPromoterSchema).max(40),
    /** Provider prose when the promoter list is empty. Omitted on older stored issues. */
    promoterNarrative: narrativeSchema.nullable().optional(),
    /** Anchor book. Omitted until a successful anchor document has at least one investor. */
    anchors: ipoAnchorsSchema.optional(),
    objectsOfIssue: objectsOfIssueSchema,
    sourceFinancials: sourceFinancialsSchema,
    cmpRupees: z.number().finite().nonnegative().nullable(),
    currentGainPercent: percentSchema,
  })
  .strict();

export type IpoProfile = z.infer<typeof ipoProfileSchema>;
export type IpoAnchors = z.infer<typeof ipoAnchorsSchema>;
export type SourceFinancials = z.infer<typeof sourceFinancialsSchema>;
