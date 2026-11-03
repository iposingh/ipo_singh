import { z } from "zod";
import { freshnessSchema, isoDateSchema, nullableTimestampSchema, percentSchema, rupeeAmountSchema, stableIdSchema } from "./primitives.ts";

export const indicativeGmpDisclaimer =
  "Indicative only. A GMP-implied price is not a guaranteed listing price.";

export const gmpSnapshotSchema = z
  .object({
    amountRupees: rupeeAmountSchema,
    percent: percentSchema,
    indicativeImpliedPriceRupees: rupeeAmountSchema,
    observedAt: nullableTimestampSchema,
    freshness: freshnessSchema,
  })
  .strict();

export const gmpSessionSchema = z.enum(["daily", "intraday"]);

export const gmpObservationSchema = z
  .object({
    observedAt: z.string().datetime({ offset: true }),
    /** Published calendar date for a daily trend point. Absent on a current snapshot. */
    observedOn: isoDateSchema.nullable().optional(),
    amountRupees: rupeeAmountSchema,
    percent: percentSchema,
    session: gmpSessionSchema,
    /** Published slot text such as `11 AM`. Absent when the vendor did not send one. */
    slotLabel: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .strict();

export const gmpWindowExtremeSchema = z
  .object({
    amountRupees: z.number().finite(),
    observedOn: isoDateSchema,
  })
  .strict();

export const gmpHistoryWindowSchema = z
  .object({
    high: gmpWindowExtremeSchema.nullable(),
    low: gmpWindowExtremeSchema.nullable(),
    truncated: z.boolean(),
    timelineLocked: z.boolean(),
  })
  .strict();

export const gmpHistorySchema = z
  .object({
    ipoId: stableIdSchema,
    observations: z.array(gmpObservationSchema),
    window: gmpHistoryWindowSchema.optional(),
  })
  .strict();

export type GmpSnapshot = z.infer<typeof gmpSnapshotSchema>;
export type GmpSession = z.infer<typeof gmpSessionSchema>;
export type GmpObservation = z.infer<typeof gmpObservationSchema>;
export type GmpHistoryWindow = z.infer<typeof gmpHistoryWindowSchema>;
export type GmpHistory = z.infer<typeof gmpHistorySchema>;
