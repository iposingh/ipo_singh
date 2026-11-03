import { z } from "zod";

export const allotmentVerificationRecordSchema = z
  .object({
    ipoId: z.string().trim().min(1).max(80),
    registrarId: z.string().trim().min(1).max(80).nullable(),
    verificationStatus: z.enum(["unconfirmed", "confirmed", "failed", "unsupported", "inconclusive"]),
    allotmentConfirmed: z.boolean(),
    verificationSource: z.string().trim().min(1).max(240).nullable(),
    verificationEvidence: z.string().trim().min(1).max(2_000).nullable(),
    verificationMethod: z.string().trim().min(1).max(120).nullable(),
    sourceUrl: z.string().url().max(2_000).nullable(),
    matchedCompanyId: z.string().trim().min(1).max(120).nullable(),
    verifiedAt: z.string().datetime().nullable(),
    monitoringStartedAt: z.string().datetime().nullable(),
    lastCheckedAt: z.string().datetime(),
    nextCheckAt: z.string().datetime().nullable(),
    note: z.string().trim().min(1).max(1_000),
    notificationDispatch: z.enum(["not-sent", "queued", "sent", "failed", "skipped"]),
    notificationEligibleDevices: z.number().int().nonnegative().nullable(),
    notificationAccepted: z.number().int().nonnegative().nullable(),
    notificationRejected: z.number().int().nonnegative().nullable(),
    errorName: z.string().trim().min(1).max(120).nullable(),
  })
  .strict();

export type StoredAllotmentVerification = z.infer<typeof allotmentVerificationRecordSchema>;

export type AllotmentVerificationStore = {
  upsert(record: StoredAllotmentVerification): Promise<StoredAllotmentVerification>;
  findByIpo(ipoId: string): Promise<StoredAllotmentVerification | null>;
  list(limit?: number): Promise<StoredAllotmentVerification[]>;
};
