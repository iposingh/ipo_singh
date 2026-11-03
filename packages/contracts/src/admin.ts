import { z } from "zod";
import { accountIdSchema, accountRoleSchema, publicAccountSchema } from "./account.ts";
import { timestampSchema } from "./primitives.ts";

/** A super admin confirms the current password before changing another person's role. */
export const adminRoleChangeRequestSchema = z
  .object({
    userId: accountIdSchema,
    role: accountRoleSchema,
    currentPassword: z.string().min(1).max(128),
  })
  .strict();

/** A super admin confirms the current password before revoking another person's sessions. */
export const adminSessionRevokeRequestSchema = z
  .object({
    userId: accountIdSchema,
    currentPassword: z.string().min(1).max(128),
  })
  .strict();

/**
 * Provider status an administrator may see.
 * API keys, database addresses, and the operations token are not fields.
 */
export const adminProviderStatusSchema = z
  .object({
    provider: z.enum(["not_configured", "ipo-guru", "mock"]),
    ipoGuruEnabled: z.boolean(),
    credentialConfigured: z.boolean(),
    /** Effective application ceilings after min(PROVIDER_*, IPOGURU_*). */
    minuteBudget: z.number().int().positive().nullable(),
    dailyBudget: z.number().int().positive().nullable(),
    /** Last successful GET /me snapshot when the worker/API has one. Never includes the API key. */
    account: z
      .object({
        plan: z.string().min(1).max(40),
        scopes: z.array(z.string().min(1).max(64)).max(40),
        limits: z
          .object({
            perMinute: z.number().int().nonnegative(),
            perDay: z.number().int().nonnegative(),
            gmpHistoryDays: z.number().int().nonnegative().nullable(),
          })
          .strict(),
        expiresAt: z.string().min(1).max(40).nullable(),
        observedAt: z.string().datetime(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const adminAuditActionSchema = z.enum([
  "access_denied",
  "role_change",
  "session_revoke",
  "provider_read",
  "bootstrap",
  "manual_sync",
  "banner_change",
  "allotment_confirm",
  "allotment_retry",
]);

export const adminAuditEventSchema = z
  .object({
    id: accountIdSchema,
    actorUserId: accountIdSchema,
    action: adminAuditActionSchema,
    outcome: z.enum(["succeeded", "denied"]),
    targetUserId: accountIdSchema.nullable(),
    createdAt: timestampSchema,
  })
  .strict();

export const adminAuditListSchema = z
  .object({
    events: z.array(adminAuditEventSchema).max(50),
  })
  .strict();

export const adminAccountResponseSchema = z
  .object({
    account: publicAccountSchema,
  })
  .strict();

export const adminRevokeResultSchema = z
  .object({
    revoked: z.literal(true),
  })
  .strict();

export type AdminAuditAction = z.infer<typeof adminAuditActionSchema>;
export type AdminAuditEvent = z.infer<typeof adminAuditEventSchema>;
export type AdminProviderStatus = z.infer<typeof adminProviderStatusSchema>;
