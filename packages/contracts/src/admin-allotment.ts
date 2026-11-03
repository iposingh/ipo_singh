import { z } from "zod";
import { nullableTimestampSchema } from "./primitives.ts";

export const adminAllotmentVerificationRowSchema = z
  .object({
    ipoId: z.string().min(1).max(80),
    slug: z.string().min(1).max(120).nullable(),
    companyName: z.string().min(1).max(240).nullable(),
    registrarId: z.string().min(1).max(80).nullable(),
    registrarName: z.string().min(1).max(240).nullable(),
    expectedAllotmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    monitoringStartedAt: nullableTimestampSchema,
    verificationStatus: z.enum(["unconfirmed", "confirmed", "failed", "unsupported", "inconclusive", "pending"]),
    allotmentConfirmed: z.boolean(),
    lastCheckedAt: nullableTimestampSchema,
    nextCheckAt: nullableTimestampSchema,
    evidenceSource: z.string().min(1).max(240).nullable(),
    verificationEvidence: z.string().min(1).max(2_000).nullable(),
    matchedCompanyId: z.string().min(1).max(120).nullable(),
    sourceUrl: z.string().url().max(2_000).nullable(),
    verifiedAt: nullableTimestampSchema,
    notificationDispatch: z.enum(["not-sent", "queued", "sent", "failed", "skipped"]),
    notificationEligibleDevices: z.number().int().nonnegative().nullable(),
    notificationAccepted: z.number().int().nonnegative().nullable(),
    notificationRejected: z.number().int().nonnegative().nullable(),
    errorName: z.string().min(1).max(120).nullable(),
    note: z.string().min(1).max(1_000).nullable(),
  })
  .strict();

export const adminAllotmentVerificationListSchema = z
  .object({
    items: z.array(adminAllotmentVerificationRowSchema).max(500),
  })
  .strict();

export const adminAllotmentConfirmRequestSchema = z
  .object({
    ipoId: z.string().min(1).max(80),
    sourceUrl: z.string().url().max(2_000),
    evidenceNote: z.string().trim().min(20).max(1_000),
    currentPassword: z.string().min(1).max(128),
  })
  .strict();

export const adminAllotmentRetryRequestSchema = z
  .object({
    ipoId: z.string().min(1).max(80),
    currentPassword: z.string().min(1).max(128),
  })
  .strict();

export const adminAllotmentActionResultSchema = z
  .object({
    ok: z.literal(true),
    row: adminAllotmentVerificationRowSchema,
  })
  .strict();

export type AdminAllotmentVerificationRow = z.infer<typeof adminAllotmentVerificationRowSchema>;
