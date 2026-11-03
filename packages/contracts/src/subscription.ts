import { z } from "zod";
import { freshnessSchema, isoDateSchema, nullableTimestampSchema, stableIdSchema, timesSchema } from "./primitives.ts";

const categoryKeySchema = z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,31}$/);

export const subscriptionSubcategorySchema = z
  .object({
    key: categoryKeySchema,
    times: timesSchema,
  })
  .strict();

export const subscriptionCategorySchema = z
  .object({
    key: categoryKeySchema,
    times: timesSchema,
    subcategories: z.array(subscriptionSubcategorySchema).max(24),
  })
  .strict();

export const subscriptionSnapshotSchema = z
  .object({
    retailTimes: timesSchema,
    qibTimes: timesSchema,
    niiTimes: timesSchema,
    employeeTimes: timesSchema,
    shareholderTimes: timesSchema.optional(),
    anchorTimes: timesSchema.optional(),
    categories: z.array(subscriptionCategorySchema).max(24).optional(),
    totalTimes: timesSchema,
    observedAt: nullableTimestampSchema,
    observedOn: isoDateSchema.nullable().optional(),
    biddingDay: z.number().int().nonnegative().nullable().optional(),
    freshness: freshnessSchema,
  })
  .strict();

export const subscriptionObservationSchema = subscriptionSnapshotSchema;

export const subscriptionHistorySchema = z
  .object({
    ipoId: stableIdSchema,
    observations: z.array(subscriptionObservationSchema),
  })
  .strict();

export type SubscriptionSubcategory = z.infer<typeof subscriptionSubcategorySchema>;
export type SubscriptionCategory = z.infer<typeof subscriptionCategorySchema>;
export type SubscriptionSnapshot = z.infer<typeof subscriptionSnapshotSchema>;
export type SubscriptionHistory = z.infer<typeof subscriptionHistorySchema>;
