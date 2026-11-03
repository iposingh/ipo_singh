import { z } from "zod";
import { freshnessSchema, nullableTimestampSchema } from "./primitives.ts";

export const provenanceSchema = z
  .object({
    sourceName: z.string().trim().min(1).max(80),
    retrievedAt: nullableTimestampSchema,
    freshness: freshnessSchema,
  })
  .strict();

export type Provenance = z.infer<typeof provenanceSchema>;
