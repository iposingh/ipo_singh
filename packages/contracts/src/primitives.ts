import { z } from "zod";

/** Stable IPO Singh identifier. This is not a data-provider id. */
export const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const slugSchema = stableIdSchema;

export const companyNameSchema = z.string().trim().min(1).max(200);

export const finiteNumberSchema = z.number().finite();

/** Rupee amount. Zero is a real zero. Null means the amount was not supplied. */
export const rupeeAmountSchema = finiteNumberSchema.nullable();

/** Share count. Zero is allowed. Negative counts are rejected. */
export const shareCountSchema = z.number().int().nonnegative().nullable();

/** Subscription or gain multiple input. Negative percentages are allowed. */
export const percentSchema = finiteNumberSchema.nullable();

/** Non-negative multiple such as subscription times. */
export const timesSchema = z.number().finite().nonnegative().nullable();

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = isoDatePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Calendar date in YYYY-MM-DD. Interpret it as an India date, not a UTC instant. */
export const isoDateSchema = z.string().refine(isIsoDate, { message: "Expected a real YYYY-MM-DD date" });

export const nullableIsoDateSchema = isoDateSchema.nullable();

export const timestampSchema = z.string().datetime({ offset: true });

export const nullableTimestampSchema = timestampSchema.nullable();

export const httpUrlSchema = z.string().url().max(2000);

export const nullableHttpUrlSchema = httpUrlSchema.nullable();

export const freshnessSchema = z.enum(["missing", "fresh", "stale"]);

export type StableId = z.infer<typeof stableIdSchema>;
export type FreshnessState = z.infer<typeof freshnessSchema>;
