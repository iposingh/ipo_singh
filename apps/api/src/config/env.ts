import { z } from "zod";
import { readCachePolicy, type CachePolicy } from "./cache-policy.ts";
import { cacheEnvironmentSegment, readDeploymentEnv, type DeploymentEnv } from "./deployment.ts";
import { readHttpLimits, type HttpLimits } from "./http-limits.ts";
import { readMongoConfig, type MongoConfig } from "./mongo.ts";
import { readIpoGuruConfig, type IpoGuruConfig } from "./ipoguru.ts";
import { readProviderSelection, type ProviderSelection } from "./provider.ts";
import { readQuotaPolicy, type QuotaPolicy } from "./quota.ts";
import { readRedisConfig, type RedisConfig } from "./redis.ts";
import { ConfigError } from "../shared/errors.ts";
import type { LogLevel } from "../shared/logger.ts";

const nodeEnvSchema = z.enum(["development", "test", "production"]);
const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);
const bodyLimitSchema = z.string().trim().regex(/^\d+(b|kb|mb)$/i);
const serviceNameSchema = z.string().trim().regex(/^[a-z0-9-]+$/).min(1).max(40);
const versionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);

const envSchema = z
  .object({
    NODE_ENV: nodeEnvSchema.default("development"),
    HOST: z.string().trim().min(1).max(255).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    CORS_ORIGINS: z.string().optional(),
    LOG_LEVEL: logLevelSchema.default("info"),
    REQUEST_BODY_LIMIT: bodyLimitSchema.default("100kb"),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(10_000),
    TRUST_PROXY: z.enum(["true", "false", "1", "0"]).default("false"),
    SERVICE_NAME: serviceNameSchema.default("ipo-singh-api"),
  })
  .strict();

export type AppConfig = HttpLimits & {
  nodeEnv: z.infer<typeof nodeEnvSchema>;
  /** Logical lane for Mongo/Redis isolation (staging may use NODE_ENV=production). */
  deployment: DeploymentEnv;
  host: string;
  port: number;
  corsOrigins: readonly string[];
  logLevel: LogLevel;
  requestBodyLimit: string;
  shutdownTimeoutMs: number;
  trustProxy: boolean;
  serviceName: string;
  version: string;
  mongodb: MongoConfig | null;
  redis: RedisConfig | null;
  cache: CachePolicy;
  quota: QuotaPolicy;
  provider: ProviderSelection | null;
  ipoGuru: IpoGuruConfig;
  /** Shared secret for GET /internal/status. Absent from JSON serialization. */
  opsToken: string | null;
  /**
   * Shared secret for Next.js → API calls (SSR + admin BFF).
   * When presented as `x-ipo-singh-internal`, catalogue/admin rate limits are skipped.
   * Auth login budgets stay enforced. Absent from JSON serialization.
   */
  internalServiceToken: string | null;
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

function isBrowserOrigin(value: string): boolean {
  if (value === "*") return false;
  try {
    const url = new URL(value);
    return url.username === "" && url.password === "" && url.search === "" && url.hash === "" && url.pathname === "/";
  } catch {
    return false;
  }
}

function isEphemeralTunnelHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.endsWith(".trycloudflare.com") ||
    host.endsWith(".cfargotunnel.com") ||
    host.endsWith(".loca.lt") ||
    host.endsWith(".ngrok.io") ||
    host.endsWith(".ngrok-free.app") ||
    host.endsWith(".ngrok.app") ||
    host.endsWith(".serveo.net")
  );
}

function corsOriginsFor(nodeEnv: AppConfig["nodeEnv"], deployment: DeploymentEnv, raw: string | undefined): string[] {
  const source = raw?.trim() ? raw : nodeEnv === "development" && deployment === "development" ? "http://localhost:3000" : "";
  const origins: string[] = [];
  for (const part of source.split(",")) {
    const candidate = part.trim();
    if (!candidate) continue;
    if (!isBrowserOrigin(candidate)) {
      throw new ConfigError(["CORS_ORIGINS"]);
    }
    const url = new URL(candidate);
    if (isEphemeralTunnelHost(url.hostname)) {
      throw new ConfigError(["CORS_ORIGINS"]);
    }
    if ((deployment === "production" || deployment === "staging") && url.protocol !== "https:") {
      throw new ConfigError(["CORS_ORIGINS"]);
    }
    const origin = url.origin;
    if (!origins.includes(origin)) origins.push(origin);
  }
  if ((deployment === "production" || deployment === "staging") && origins.length === 0) {
    throw new ConfigError(["CORS_ORIGINS"]);
  }
  return origins;
}

export function readConfig(env: Record<string, string | undefined>, version: string): AppConfig {
  const parsedVersion = versionSchema.safeParse(version);
  if (!parsedVersion.success) {
    throw new ConfigError(["version"]);
  }

  const parsed = envSchema.safeParse({
    NODE_ENV: blankToUndefined(env.NODE_ENV),
    HOST: blankToUndefined(env.HOST),
    PORT: blankToUndefined(env.PORT),
    CORS_ORIGINS: blankToUndefined(env.CORS_ORIGINS),
    LOG_LEVEL: blankToUndefined(env.LOG_LEVEL),
    REQUEST_BODY_LIMIT: blankToUndefined(env.REQUEST_BODY_LIMIT),
    SHUTDOWN_TIMEOUT_MS: blankToUndefined(env.SHUTDOWN_TIMEOUT_MS),
    TRUST_PROXY: blankToUndefined(env.TRUST_PROXY),
    SERVICE_NAME: blankToUndefined(env.SERVICE_NAME),
  });

  if (!parsed.success) {
    throw new ConfigError(fieldsFromZod(parsed.error));
  }

  const deployment = readDeploymentEnv(env, parsed.data.NODE_ENV);
  const config: AppConfig = {
    nodeEnv: parsed.data.NODE_ENV,
    deployment,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    corsOrigins: corsOriginsFor(parsed.data.NODE_ENV, deployment, parsed.data.CORS_ORIGINS),
    logLevel: parsed.data.LOG_LEVEL,
    requestBodyLimit: parsed.data.REQUEST_BODY_LIMIT.toLowerCase(),
    shutdownTimeoutMs: parsed.data.SHUTDOWN_TIMEOUT_MS,
    trustProxy: parsed.data.TRUST_PROXY === "true" || parsed.data.TRUST_PROXY === "1",
    serviceName: parsed.data.SERVICE_NAME,
    version: parsedVersion.data,
    ...readHttpLimits(env),
    mongodb: readMongoConfig(env, parsed.data.NODE_ENV, deployment),
    redis: readRedisConfig(env),
    cache: readCachePolicy(env, cacheEnvironmentSegment(deployment)),
    quota: readQuotaPolicy(env),
    provider: readProviderSelection(env, parsed.data.NODE_ENV),
    ipoGuru: readIpoGuruConfig(env),
    opsToken: null,
    internalServiceToken: null,
  };
  return sealSecrets(config, readOpsToken(env), readInternalServiceToken(env));
}

const secretTokenPattern = /^[A-Za-z0-9._~-]{16,128}$/;

function readOpsToken(env: Record<string, string | undefined>): string | null {
  const token = blankToUndefined(env.OPS_TOKEN);
  if (!token) return null;
  if (!secretTokenPattern.test(token)) throw new ConfigError(["OPS_TOKEN"]);
  return token;
}

function readInternalServiceToken(env: Record<string, string | undefined>): string | null {
  const token = blankToUndefined(env.INTERNAL_SERVICE_TOKEN);
  if (!token) return null;
  if (!secretTokenPattern.test(token)) throw new ConfigError(["INTERNAL_SERVICE_TOKEN"]);
  return token;
}

function sealSecrets(config: AppConfig, opsToken: string | null, internalServiceToken: string | null): AppConfig {
  Object.defineProperty(config, "opsToken", { enumerable: false, writable: false, value: opsToken });
  Object.defineProperty(config, "internalServiceToken", {
    enumerable: false,
    writable: false,
    value: internalServiceToken,
  });
  return config;
}
