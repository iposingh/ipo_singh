import { z } from "zod";
import { boardSchema } from "./board.ts";
import { freshnessSchema, slugSchema, timestampSchema } from "./primitives.ts";
import { ipoStatusSchema } from "./status.ts";

const countSchema = z.number().int().nonnegative();
const nullableCount = countSchema.nullable();

const healthSchema = z.enum(["not_configured", "ok", "unavailable"]);

/** Stored catalogue counts. Null means the database could not be read. */
export const adminRecordCountsSchema = z
  .object({
    available: z.boolean(),
    complete: z.boolean(),
    total: nullableCount,
    mainboard: nullableCount,
    sme: nullableCount,
    open: nullableCount,
    upcoming: nullableCount,
    listed: nullableCount,
    closed: nullableCount,
    allotment: nullableCount,
    statusMissing: nullableCount,
  })
  .strict();

export const adminDashboardSchema = z
  .object({
    observedAt: timestampSchema,
    records: adminRecordCountsSchema,
    sync: z
      .object({
        available: z.boolean(),
        succeeded: nullableCount,
        failed: nullableCount,
        lastSuccessAt: timestampSchema.nullable(),
      })
      .strict(),
    provider: z
      .object({
        name: z.enum(["not_configured", "ipo-guru", "mock"]),
        ipoGuruEnabled: z.boolean(),
        health: healthSchema,
        lastFailure: z
          .object({
            httpStatus: z.number().int().min(0).max(599),
            code: z.string().regex(/^[a-z0-9_]{1,80}$/).nullable(),
            observedAt: timestampSchema,
          })
          .strict()
          .nullable(),
      })
      .strict(),
    quota: z
      .object({
        minuteUsed: nullableCount,
        minuteLimit: z.number().int().positive(),
        minuteRemaining: nullableCount,
        dayUsed: nullableCount,
        dayLimit: z.number().int().positive(),
        dayRemaining: nullableCount,
        reservedRequests: countSchema,
        vendorRemaining: nullableCount,
      })
      .strict(),
    cache: z
      .object({
        health: healthSchema,
        hits: countSchema,
        misses: countSchema,
        staleHits: countSchema,
        originLoads: countSchema,
        originFailures: countSchema,
        storeErrors: countSchema,
      })
      .strict(),
    database: healthSchema,
    validationFailures: countSchema,
    accounts: z
      .object({
        available: z.boolean(),
        member: nullableCount,
        admin: nullableCount,
        superAdmin: nullableCount,
        pending: nullableCount,
        active: nullableCount,
        suspended: nullableCount,
        closed: nullableCount,
      })
      .strict(),
    watchlist: z
      .object({
        available: z.boolean(),
        saved: nullableCount,
      })
      .strict(),
    notifications: z
      .object({
        created: countSchema,
        duplicates: countSchema,
        skipped: countSchema,
        failed: countSchema,
        lastFinishedAt: timestampSchema.nullable(),
        storedAvailable: z.boolean(),
        stored: nullableCount,
      })
      .strict(),
    warnings: z
      .array(
        z
          .object({
            code: z.enum(["database", "cache", "sync_failures", "validation", "provider_outage", "quota"]),
            message: z.string().min(1).max(160),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

export const adminIpoInspectionSchema = z
  .object({
    complete: z.boolean(),
    records: z
      .array(
        z
          .object({
            slug: slugSchema,
            companyName: z.string().trim().min(1).max(200).nullable(),
            board: boardSchema,
            status: ipoStatusSchema.nullable(),
            freshness: freshnessSchema,
            fetchedAt: timestampSchema,
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

export const adminSyncHistorySchema = z
  .object({
    available: z.boolean(),
    runs: z
      .array(
        z
          .object({
            resource: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40),
            status: z.enum(["running", "succeeded", "failed"]),
            startedAt: timestampSchema,
            finishedAt: timestampSchema.nullable(),
            fetchedCount: countSchema,
            errorName: z.string().trim().min(1).max(80).nullable(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

/** A super admin confirms the current password. The body cannot choose a sync category. */
export const adminManualSyncRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
  })
  .strict();

export const adminManualSyncResultSchema = z
  .object({
    status: z.enum(["succeeded", "failed", "skipped", "idle"]),
    fetchedCount: countSchema,
  })
  .strict();

export type AdminDashboard = z.infer<typeof adminDashboardSchema>;
export type AdminManualSyncResult = z.infer<typeof adminManualSyncResultSchema>;
