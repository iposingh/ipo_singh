import { z } from "zod";

const planSchema = z.string().trim().regex(/^[a-z0-9_-]{1,40}$/);
const scopeSchema = z.string().trim().regex(/^[a-z0-9_-]{1,40}$/);
const labelSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => [...value].every((character) => character.charCodeAt(0) > 31));

export const ipoGuruAccountSchema = z
  .object({
    plan: planSchema,
    planLabel: labelSchema,
    expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    lapsed: z.boolean(),
    scopes: z.array(scopeSchema).max(32),
    limits: z
      .object({
        perMinute: z.number().int().positive().max(100_000),
        perDay: z.number().int().positive().max(10_000_000),
        gmpHistoryDays: z.number().int().nonnegative().max(10_000).nullable(),
      })
      .strict(),
    usageToday: z
      .object({
        used: z.number().int().nonnegative().max(10_000_000),
        remaining: z.number().int().nonnegative().max(10_000_000),
        resetsAt: labelSchema,
      })
      .strict(),
  })
  .strict();

export type IpoGuruAccount = z.infer<typeof ipoGuruAccountSchema>;

const vendorAccountSchema = z
  .object({
    plan: planSchema,
    plan_label: labelSchema,
    expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    lapsed: z.boolean(),
    scopes: z.array(scopeSchema).max(32),
    limits: z
      .object({
        per_minute: z.number().int().positive().max(100_000),
        per_day: z.number().int().positive().max(10_000_000),
        gmp_history_days: z.number().int().nonnegative().max(10_000).nullable(),
      })
      .strict(),
    usage_today: z
      .object({
        used: z.number().int().nonnegative().max(10_000_000),
        remaining: z.number().int().nonnegative().max(10_000_000),
        resets_at: labelSchema,
      })
      .strict(),
  })
  .strip();

export type EnvelopeReading =
  | { kind: "data"; plan: string; data: unknown }
  | { kind: "empty"; plan: string; count: number }
  | { kind: "failure"; code: string | null; retryAfterSeconds: number | null }
  | { kind: "malformed" };

/**
 * A successful envelope with an empty collection is empty data.
 * `success: false`, invalid JSON, and a document that disagrees with itself are failures.
 */
export function readEnvelope(body: string): EnvelopeReading {
  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    return { kind: "malformed" };
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return { kind: "malformed" };
  const record = payload as Record<string, unknown>;
  if (record.success === false) {
    const code = typeof record.error === "string" && /^[a-z0-9_]{1,80}$/.test(record.error) ? record.error : null;
    const retryAfterSeconds =
      typeof record.retry_after === "number" && Number.isFinite(record.retry_after) && record.retry_after >= 0
        ? record.retry_after
        : null;
    return { kind: "failure", code, retryAfterSeconds };
  }
  if (record.success !== true) return { kind: "malformed" };
  if (typeof record.plan !== "string" || !/^[a-z0-9_-]{1,40}$/.test(record.plan)) return { kind: "malformed" };
  if (!("data" in record)) return { kind: "malformed" };
  if (Array.isArray(record.data)) {
    const count = record.count;
    if (count !== undefined && (typeof count !== "number" || !Number.isInteger(count) || count < 0)) return { kind: "malformed" };
    if (count !== undefined && count !== record.data.length) return { kind: "malformed" };
    if (record.data.length === 0) return { kind: "empty", plan: record.plan, count: 0 };
    return { kind: "data", plan: record.plan, data: record.data };
  }
  if (typeof record.data === "object" && record.data !== null) {
    return { kind: "data", plan: record.plan, data: record.data };
  }
  return { kind: "malformed" };
}

export function readAccount(data: unknown): IpoGuruAccount | null {
  const parsed = vendorAccountSchema.safeParse(data);
  if (!parsed.success) return null;
  return {
    plan: parsed.data.plan,
    planLabel: parsed.data.plan_label,
    expiresAt: parsed.data.expires_at,
    lapsed: parsed.data.lapsed,
    scopes: parsed.data.scopes,
    limits: {
      perMinute: parsed.data.limits.per_minute,
      perDay: parsed.data.limits.per_day,
      gmpHistoryDays: parsed.data.limits.gmp_history_days,
    },
    usageToday: {
      used: parsed.data.usage_today.used,
      remaining: parsed.data.usage_today.remaining,
      resetsAt: parsed.data.usage_today.resets_at,
    },
  };
}
