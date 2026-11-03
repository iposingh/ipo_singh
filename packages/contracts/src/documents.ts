import { z } from "zod";
import { httpUrlSchema, nullableIsoDateSchema } from "./primitives.ts";

export const documentKindSchema = z.enum(["drhp", "rhp", "source"]);

export const sourceDocumentSchema = z
  .object({
    kind: documentKindSchema,
    title: z.string().trim().min(1).max(200),
    url: httpUrlSchema,
    publishedOn: nullableIsoDateSchema,
  })
  .strict();

export type DocumentKind = z.infer<typeof documentKindSchema>;
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;
