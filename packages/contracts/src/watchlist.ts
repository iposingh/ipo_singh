import { z } from "zod";
import { ipoSummarySchema } from "./ipo.ts";
import { stableIdSchema, timestampSchema } from "./primitives.ts";

/** A personal reminder. It is not a copy of GMP, price, or subscription data. */
export const watchlistNoteSchema = z.string().trim().min(1).max(280);

export const saveWatchlistRequestSchema = z
  .object({
    ipoId: stableIdSchema,
    note: watchlistNoteSchema.nullable().optional(),
  })
  .strict();

export const watchlistItemSchema = z
  .object({
    ipoId: stableIdSchema,
    addedAt: timestampSchema,
    note: watchlistNoteSchema.nullable(),
    availability: z.enum(["available", "unavailable"]),
    ipo: ipoSummarySchema.nullable(),
  })
  .strict();

export const watchlistResponseSchema = z
  .object({
    items: z.array(watchlistItemSchema).max(200),
  })
  .strict();

export const watchlistMembershipSchema = z
  .object({
    ipoId: stableIdSchema,
    saved: z.boolean(),
    addedAt: timestampSchema.nullable(),
    note: watchlistNoteSchema.nullable(),
  })
  .strict();

export type WatchlistItem = z.infer<typeof watchlistItemSchema>;
export type WatchlistMembership = z.infer<typeof watchlistMembershipSchema>;
