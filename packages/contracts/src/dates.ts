import { z } from "zod";
import { nullableIsoDateSchema } from "./primitives.ts";

export const ipoDatesSchema = z
  .object({
    openDate: nullableIsoDateSchema,
    closeDate: nullableIsoDateSchema,
    allotmentDate: nullableIsoDateSchema,
    listingDate: nullableIsoDateSchema,
  })
  .strict();

export type IpoDates = z.infer<typeof ipoDatesSchema>;
