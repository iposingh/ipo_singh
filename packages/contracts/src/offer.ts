import { z } from "zod";
import { rupeeAmountSchema, shareCountSchema } from "./primitives.ts";

const issuePriceSchema = z.number().finite().nonnegative();

export const priceBandSchema = z
  .object({
    lowRupees: issuePriceSchema.nullable(),
    highRupees: issuePriceSchema.nullable(),
  })
  .strict();

export const offerSchema = z
  .object({
    priceBand: priceBandSchema,
    /** Fixed issue price when the band has collapsed to one price. Null when unknown. */
    issuePriceRupees: issuePriceSchema.nullable(),
    issueSizeRupees: rupeeAmountSchema,
    lotSizeShares: shareCountSchema,
    /** Stored value only. Recalculate with the shared investment functions before display. */
    minimumInvestmentRupees: rupeeAmountSchema,
  })
  .strict();

export type PriceBand = z.infer<typeof priceBandSchema>;
export type Offer = z.infer<typeof offerSchema>;
