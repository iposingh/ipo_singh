import { ipoGuruAccountSchema } from "../../providers/ipo-guru/envelope.ts";
import { timestampSchema } from "@ipo-singh/contracts";
import { z } from "zod";

const countSchema = z.number().int().nonnegative();

const vendorQuotaSchema = z
  .object({
    plan: z.string().regex(/^[a-z0-9_-]{1,40}$/).nullable(),
    limit: countSchema.nullable(),
    remaining: countSchema.nullable(),
  })
  .strict();

export const ipoGuruAccountViewSchema = ipoGuruAccountSchema
  .extend({
    observedAt: timestampSchema,
  })
  .strict();

export const ipoGuruMonitorSchema = z
  .object({
    enabled: z.boolean(),
    minuteBudget: z.number().int().positive().nullable(),
    dailyBudget: z.number().int().positive().nullable(),
    minuteUsed: countSchema.nullable(),
    dayUsed: countSchema.nullable(),
    vendor: vendorQuotaSchema,
    account: ipoGuruAccountViewSchema.nullable(),
    lastFailure: z
      .object({
        httpStatus: z.number().int().min(0).max(599),
        code: z.string().regex(/^[a-z0-9_]{1,80}$/).nullable(),
        observedAt: timestampSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();

export const operationsStatusSchema = z
  .object({
    service: z.string().min(1),
    version: z.string().min(1),
    timestamp: timestampSchema,
    timestampIst: z.string().min(1),
    node: z.string().regex(/^v\d+\.\d+\.\d+/),
    uptimeSeconds: countSchema,
    provider: z.enum(["not_configured", "ipo-guru", "mock"]),
    providerRequests: countSchema,
    providerEndpoints: z
      .array(
        z
          .object({
            endpoint: z.string().regex(/^\/[A-Za-z0-9/._-]{0,199}$/),
            requests: countSchema,
            latency: z
              .object({
                samples: countSchema,
                totalMs: countSchema,
                maxMs: countSchema,
              })
              .strict(),
          })
          .strict(),
      )
      .max(20),
    quota: z
      .object({
        minuteUsed: countSchema.nullable(),
        minuteLimit: z.number().int().positive(),
        dayUsed: countSchema.nullable(),
        dayLimit: z.number().int().positive(),
        reservedRequests: countSchema,
      })
      .strict(),
    cache: z
      .object({
        hits: countSchema,
        misses: countSchema,
        stale: countSchema,
      })
      .strict(),
    sync: z
      .object({
        succeeded: countSchema,
        failed: countSchema,
        lastSuccessAt: z.string().datetime({ offset: true }).nullable(),
      })
      .strict(),
    alerts: z
      .object({
        created: countSchema,
        duplicates: countSchema,
        skipped: countSchema,
        failed: countSchema,
        lastFinishedAt: timestampSchema.nullable(),
      })
      .strict(),
    push: z
      .object({
        examined: countSchema,
        sent: countSchema,
        failed: countSchema,
        skipped: countSchema,
        invalidTokens: countSchema,
        receiptConfirmed: countSchema,
        receiptInvalidTokens: countSchema,
        receiptPending: countSchema,
        lastDeliveryAt: timestampSchema.nullable(),
        lastReceiptAt: timestampSchema.nullable(),
        lastDeliveryStatus: z.enum(["ran", "locked", "unavailable", "disabled"]).nullable(),
      })
      .strict(),
    validationFailures: countSchema,
    ipoGuru: ipoGuruMonitorSchema,
    dependencies: z
      .object({
        database: z.enum(["not_configured", "ok", "unavailable"]),
        cache: z.enum(["not_configured", "ok", "unavailable"]),
        storedMetrics: z.enum(["not_configured", "ok", "unavailable"]),
      })
      .strict(),
  })
  .strict();

export type OperationsStatus = z.infer<typeof operationsStatusSchema>;
