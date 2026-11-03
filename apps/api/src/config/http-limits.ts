import { z } from "zod";
import { ConfigError } from "../shared/errors.ts";

export type RateLimitPolicy = {
  windowMs: number;
  cataloguePerWindow: number;
  searchPerWindow: number;
  detailPerWindow: number;
  authPerWindow: number;
  adminPerWindow: number;
};

export type HttpLimits = {
  rateLimit: RateLimitPolicy;
  requestTimeoutMs: number;
  headersTimeoutMs: number;
  keepAliveTimeoutMs: number;
};

const limitsSchema = z
  .object({
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
    // Catalogue default covers Next.js SSR fan-out (home/calendar/boards share one egress IP).
    RATE_LIMIT_CATALOGUE: z.coerce.number().int().min(1).max(10_000).default(300),
    RATE_LIMIT_SEARCH: z.coerce.number().int().min(1).max(10_000).default(60),
    RATE_LIMIT_DETAIL: z.coerce.number().int().min(1).max(10_000).default(120),
    RATE_LIMIT_AUTH: z.coerce.number().int().min(1).max(10_000).default(10),
    // Admin UI + BFF session checks need headroom; still capped by the catalogue ceiling.
    RATE_LIMIT_ADMIN: z.coerce.number().int().min(1).max(10_000).default(120),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
    HEADERS_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(10_000),
    KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(5_000),
  })
  .strict();

function blank(value: string | undefined): string | undefined {
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

export function defaultHttpLimits(): HttpLimits {
  return {
    rateLimit: {
      windowMs: 60_000,
      cataloguePerWindow: 300,
      searchPerWindow: 60,
      detailPerWindow: 120,
      authPerWindow: 10,
      adminPerWindow: 120,
    },
    requestTimeoutMs: 15_000,
    headersTimeoutMs: 10_000,
    keepAliveTimeoutMs: 5_000,
  };
}

export function readHttpLimits(env: Record<string, string | undefined>): HttpLimits {
  const parsed = limitsSchema.safeParse({
    RATE_LIMIT_WINDOW_MS: blank(env.RATE_LIMIT_WINDOW_MS),
    RATE_LIMIT_CATALOGUE: blank(env.RATE_LIMIT_CATALOGUE),
    RATE_LIMIT_SEARCH: blank(env.RATE_LIMIT_SEARCH),
    RATE_LIMIT_DETAIL: blank(env.RATE_LIMIT_DETAIL),
    RATE_LIMIT_AUTH: blank(env.RATE_LIMIT_AUTH),
    RATE_LIMIT_ADMIN: blank(env.RATE_LIMIT_ADMIN),
    REQUEST_TIMEOUT_MS: blank(env.REQUEST_TIMEOUT_MS),
    HEADERS_TIMEOUT_MS: blank(env.HEADERS_TIMEOUT_MS),
    KEEP_ALIVE_TIMEOUT_MS: blank(env.KEEP_ALIVE_TIMEOUT_MS),
  });
  if (!parsed.success) throw new ConfigError(fieldsFromZod(parsed.error));

  const data = parsed.data;
  if (data.RATE_LIMIT_SEARCH > data.RATE_LIMIT_CATALOGUE) throw new ConfigError(["RATE_LIMIT_SEARCH"]);
  if (data.RATE_LIMIT_DETAIL > data.RATE_LIMIT_CATALOGUE) throw new ConfigError(["RATE_LIMIT_DETAIL"]);
  if (data.RATE_LIMIT_AUTH > data.RATE_LIMIT_CATALOGUE) throw new ConfigError(["RATE_LIMIT_AUTH"]);
  if (data.RATE_LIMIT_ADMIN > data.RATE_LIMIT_CATALOGUE) throw new ConfigError(["RATE_LIMIT_ADMIN"]);
  if (data.HEADERS_TIMEOUT_MS <= data.KEEP_ALIVE_TIMEOUT_MS || data.REQUEST_TIMEOUT_MS < data.HEADERS_TIMEOUT_MS) {
    throw new ConfigError(["HEADERS_TIMEOUT_MS", "KEEP_ALIVE_TIMEOUT_MS", "REQUEST_TIMEOUT_MS"]);
  }

  return {
    rateLimit: {
      windowMs: data.RATE_LIMIT_WINDOW_MS,
      cataloguePerWindow: data.RATE_LIMIT_CATALOGUE,
      searchPerWindow: data.RATE_LIMIT_SEARCH,
      detailPerWindow: data.RATE_LIMIT_DETAIL,
      authPerWindow: data.RATE_LIMIT_AUTH,
      adminPerWindow: data.RATE_LIMIT_ADMIN,
    },
    requestTimeoutMs: data.REQUEST_TIMEOUT_MS,
    headersTimeoutMs: data.HEADERS_TIMEOUT_MS,
    keepAliveTimeoutMs: data.KEEP_ALIVE_TIMEOUT_MS,
  };
}
