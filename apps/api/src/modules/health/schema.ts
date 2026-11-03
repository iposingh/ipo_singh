import { timestampSchema } from "@ipo-singh/contracts";
import { z } from "zod";

const dependencySchema = z.literal("not_configured");
const databaseCheckSchema = z.enum(["not_configured", "ok", "unavailable"]);
const cacheCheckSchema = z.enum(["not_configured", "ok", "unavailable"]);

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.string().min(1),
    version: z.string().min(1),
    timestamp: timestampSchema,
    timestampIst: z.string().min(1),
  })
  .strict();

export const readyResponseSchema = z
  .object({
    status: z.enum(["ready", "not_ready"]),
    service: z.string().min(1),
    version: z.string().min(1),
    timestamp: timestampSchema,
    timestampIst: z.string().min(1),
    checks: z
      .object({
        process: z.enum(["ok", "shutting_down"]),
        database: databaseCheckSchema,
        cache: cacheCheckSchema,
        provider: dependencySchema,
        jobs: dependencySchema,
      })
      .strict(),
  })
  .strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
