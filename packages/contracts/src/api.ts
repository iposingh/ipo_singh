import { z } from "zod";
import { boardSchema } from "./board.ts";
import { financialPeriodSchema } from "./financials.ts";
import { gmpHistorySchema, gmpSnapshotSchema } from "./gmp.ts";
import { ipoSummarySchema } from "./ipo.ts";
import { isoDateSchema, stableIdSchema } from "./primitives.ts";
import { provenanceSchema } from "./provenance.ts";
import { registrarSchema } from "./registrar.ts";
import { ipoStatusSchema } from "./status.ts";
import { subscriptionHistorySchema, subscriptionSnapshotSchema } from "./subscription.ts";

export const paginationSchema = z
  .object({
    limit: z.number().int().min(1).max(100),
    nextCursor: z.string().trim().min(1).max(200).nullable(),
    /** Null when the total is unknown. Zero when the result set is known to be empty. */
    totalCount: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const ipoListQuerySchema = z
  .object({
    board: boardSchema.optional(),
    status: ipoStatusSchema.optional(),
    q: z.string().trim().min(1).max(80).optional(),
    sort: z.enum(["open", "close", "listing"]).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const searchQuerySchema = ipoListQuerySchema
  .required({ q: true })
  .extend({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .strict();

export const calendarQuerySchema = z
  .object({
    board: boardSchema.optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const gmpResponseSchema = z
  .object({
    ipoId: stableIdSchema,
    gmp: gmpSnapshotSchema.nullable(),
    provenance: provenanceSchema,
  })
  .strict();

export const gmpHistoryResponseSchema = gmpHistorySchema
  .extend({
    provenance: provenanceSchema,
  })
  .strict();

export const subscriptionResponseSchema = z
  .object({
    ipoId: stableIdSchema,
    subscription: subscriptionSnapshotSchema.nullable(),
    provenance: provenanceSchema,
  })
  .strict();

export const subscriptionHistoryResponseSchema = subscriptionHistorySchema
  .extend({
    provenance: provenanceSchema,
  })
  .strict();

export const financialsResponseSchema = z
  .object({
    ipoId: stableIdSchema,
    periods: z.array(financialPeriodSchema),
    provenance: provenanceSchema,
  })
  .strict();

export const registrarResponseSchema = z
  .object({
    ipoId: stableIdSchema,
    registrar: registrarSchema.nullable(),
    provenance: provenanceSchema,
    verification: z.literal("verify-before-use"),
  })
  .strict();

export const calendarEventSchema = z.enum(["open", "close", "allotment", "listing"]);

export const calendarEntrySchema = z
  .object({
    date: isoDateSchema,
    event: calendarEventSchema,
    ipo: ipoSummarySchema,
  })
  .strict();

export const apiErrorCodeSchema = z.enum([
  "validation_error",
  "not_found",
  "unavailable",
  "rate_limited",
  "unauthenticated",
  "forbidden",
]);

export const fieldErrorSchema = z
  .object({
    field: z.string().trim().min(1).max(80),
    message: z.string().trim().min(1).max(300),
  })
  .strict();

export const apiErrorSchema = z
  .object({
    code: apiErrorCodeSchema,
    message: z.string().trim().min(1).max(300),
    fieldErrors: z.array(fieldErrorSchema).optional(),
  })
  .strict();

export function pageSchema<Item extends z.ZodTypeAny>(itemSchema: Item) {
  return z
    .object({
      items: z.array(itemSchema),
      page: paginationSchema,
    })
    .strict();
}

export type Pagination = z.infer<typeof paginationSchema>;
export type IpoListQuery = z.infer<typeof ipoListQuerySchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export type CalendarEntry = z.infer<typeof calendarEntrySchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
