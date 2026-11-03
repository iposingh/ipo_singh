import { z } from "zod";
import { ConfigError } from "../shared/errors.ts";

const timeoutSchema = z.coerce.number().int().min(100).max(120_000);

const redisEnvSchema = z
  .object({
    REDIS_CONNECT_TIMEOUT_MS: timeoutSchema.default(5_000),
  })
  .strict();

export type RedisConfig = {
  url: string;
  connectTimeoutMs: number;
};

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

function seal(config: RedisConfig): RedisConfig {
  const url = config.url;
  Object.defineProperty(config, "url", { enumerable: false, writable: false, value: url });
  return config;
}

function isRedisUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "redis:" || url.protocol === "rediss:";
  } catch {
    return false;
  }
}

/** Redis is optional. A missing URL leaves the cache unconfigured in every environment. */
export function readRedisConfig(env: Record<string, string | undefined>): RedisConfig | null {
  const parsed = redisEnvSchema.safeParse({
    REDIS_CONNECT_TIMEOUT_MS: blankToUndefined(env.REDIS_CONNECT_TIMEOUT_MS),
  });
  if (!parsed.success) throw new ConfigError(fieldsFromZod(parsed.error));

  const url = blankToUndefined(env.REDIS_URL);
  if (!url) return null;
  if (!isRedisUrl(url)) throw new ConfigError(["REDIS_URL"]);
  return seal({ url, connectTimeoutMs: parsed.data.REDIS_CONNECT_TIMEOUT_MS });
}
