import { z } from "zod";
import { ConfigError } from "../shared/errors.ts";

export type QuotaPolicy = {
  requestsPerMinute: number;
  requestsPerDay: number;
  reservedRequests: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  circuitFailures: number;
  circuitOpenMs: number;
};

const quotaEnvSchema = z
  .object({
    PROVIDER_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(30),
    PROVIDER_REQUESTS_PER_DAY: z.coerce.number().int().min(1).max(1_000_000).default(1_000),
    PROVIDER_RESERVED_REQUESTS: z.coerce.number().int().min(0).max(1_000_000).default(50),
    PROVIDER_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    PROVIDER_BACKOFF_BASE_MS: z.coerce.number().int().min(1).max(60_000).default(200),
    PROVIDER_BACKOFF_MAX_MS: z.coerce.number().int().min(1).max(120_000).default(5_000),
    PROVIDER_CIRCUIT_FAILURES: z.coerce.number().int().min(1).max(100).default(5),
    PROVIDER_CIRCUIT_OPEN_MS: z.coerce.number().int().min(1).max(3_600_000).default(30_000),
  })
  .strict();

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function fieldsFromZod(error: z.ZodError): string[] {
  const fields = new Set<string>();
  for (const issue of error.issues) {
    const name = issue.path[0];
    fields.add(typeof name === "string" ? name : "environment");
  }
  return [...fields].sort();
}

export function defaultQuotaPolicy(): QuotaPolicy {
  return readQuotaPolicy({});
}

/**
 * Quotas are application ceilings. They are not copied from an upstream vendor contract.
 * Reserved requests stay available for an explicit priority caller.
 */
export function readQuotaPolicy(env: Record<string, string | undefined>): QuotaPolicy {
  const parsed = quotaEnvSchema.safeParse({
    PROVIDER_REQUESTS_PER_MINUTE: blankToUndefined(env.PROVIDER_REQUESTS_PER_MINUTE),
    PROVIDER_REQUESTS_PER_DAY: blankToUndefined(env.PROVIDER_REQUESTS_PER_DAY),
    PROVIDER_RESERVED_REQUESTS: blankToUndefined(env.PROVIDER_RESERVED_REQUESTS),
    PROVIDER_MAX_RETRIES: blankToUndefined(env.PROVIDER_MAX_RETRIES),
    PROVIDER_BACKOFF_BASE_MS: blankToUndefined(env.PROVIDER_BACKOFF_BASE_MS),
    PROVIDER_BACKOFF_MAX_MS: blankToUndefined(env.PROVIDER_BACKOFF_MAX_MS),
    PROVIDER_CIRCUIT_FAILURES: blankToUndefined(env.PROVIDER_CIRCUIT_FAILURES),
    PROVIDER_CIRCUIT_OPEN_MS: blankToUndefined(env.PROVIDER_CIRCUIT_OPEN_MS),
  });
  if (!parsed.success) throw new ConfigError(fieldsFromZod(parsed.error));
  if (parsed.data.PROVIDER_RESERVED_REQUESTS >= parsed.data.PROVIDER_REQUESTS_PER_DAY) {
    throw new ConfigError(["PROVIDER_RESERVED_REQUESTS"]);
  }
  if (parsed.data.PROVIDER_BACKOFF_MAX_MS < parsed.data.PROVIDER_BACKOFF_BASE_MS) {
    throw new ConfigError(["PROVIDER_BACKOFF_MAX_MS"]);
  }
  return {
    requestsPerMinute: parsed.data.PROVIDER_REQUESTS_PER_MINUTE,
    requestsPerDay: parsed.data.PROVIDER_REQUESTS_PER_DAY,
    reservedRequests: parsed.data.PROVIDER_RESERVED_REQUESTS,
    maxRetries: parsed.data.PROVIDER_MAX_RETRIES,
    backoffBaseMs: parsed.data.PROVIDER_BACKOFF_BASE_MS,
    backoffMaxMs: parsed.data.PROVIDER_BACKOFF_MAX_MS,
    circuitFailures: parsed.data.PROVIDER_CIRCUIT_FAILURES,
    circuitOpenMs: parsed.data.PROVIDER_CIRCUIT_OPEN_MS,
  };
}
