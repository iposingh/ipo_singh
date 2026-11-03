import { z } from "zod";
import { nullableIsoDateSchema, percentSchema, rupeeAmountSchema } from "./primitives.ts";

export const listingPerformanceSchema = z
  .object({
    issuePriceRupees: z.number().finite().nonnegative().nullable(),
    listingPriceRupees: z.number().finite().nonnegative().nullable(),
    /** Actual change from the issue price to the listing price. Not a GMP estimate. */
    gainPercent: percentSchema,
    listedOn: nullableIsoDateSchema,
  })
  .strict();

export type ListingPerformance = z.infer<typeof listingPerformanceSchema>;
