import { z } from "zod";
import { nullableHttpUrlSchema } from "./primitives.ts";

export const registrarSchema = z
  .object({
    name: z.string().trim().min(1).max(200).nullable(),
    websiteUrl: nullableHttpUrlSchema,
    allotmentUrl: nullableHttpUrlSchema,
  })
  .strict();

export type Registrar = z.infer<typeof registrarSchema>;
