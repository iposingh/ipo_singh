import { z } from "zod";
import type { DeploymentEnv } from "./deployment.ts";
import { assertSafeDatabase, parseMongoTarget } from "../db/mongo-target.ts";
import type { RetentionPolicy } from "../db/retention.ts";
import { ConfigError } from "../shared/errors.ts";

const daysSchema = z.coerce.number().int().min(1).max(3650);
const poolSchema = z.coerce.number().int().min(0).max(100);
const timeoutSchema = z.coerce.number().int().min(100).max(120_000);

const mongoEnvSchema = z
  .object({
    GMP_RETENTION_DAYS: daysSchema.default(400),
    SUBSCRIPTION_RETENTION_DAYS: daysSchema.default(400),
    SYNC_HISTORY_RETENTION_DAYS: daysSchema.default(90),
    PROVIDER_USAGE_RETENTION_DAYS: daysSchema.default(90),
    MONGODB_MAX_POOL_SIZE: poolSchema.default(10),
    MONGODB_MIN_POOL_SIZE: poolSchema.default(0),
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: timeoutSchema.default(5000),
    MONGODB_CONNECT_TIMEOUT_MS: timeoutSchema.default(5000),
    MONGODB_SOCKET_TIMEOUT_MS: timeoutSchema.default(20_000),
  })
  .strict();

export type MongoConfig = {
  uri: string;
  host: string;
  database: string;
  maxPoolSize: number;
  minPoolSize: number;
  serverSelectionTimeoutMs: number;
  connectTimeoutMs: number;
  socketTimeoutMs: number;
  retention: RetentionPolicy;
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

function seal(config: MongoConfig): MongoConfig {
  const uri = config.uri;
  Object.defineProperty(config, "uri", { enumerable: false, writable: false, value: uri });
  return config;
}

export function readMongoConfig(
  env: Record<string, string | undefined>,
  nodeEnv: "development" | "test" | "production",
  deployment: DeploymentEnv = nodeEnv === "production" ? "production" : nodeEnv === "test" ? "test" : "development",
): MongoConfig | null {
  const parsed = mongoEnvSchema.safeParse({
    GMP_RETENTION_DAYS: blankToUndefined(env.GMP_RETENTION_DAYS),
    SUBSCRIPTION_RETENTION_DAYS: blankToUndefined(env.SUBSCRIPTION_RETENTION_DAYS),
    SYNC_HISTORY_RETENTION_DAYS: blankToUndefined(env.SYNC_HISTORY_RETENTION_DAYS),
    PROVIDER_USAGE_RETENTION_DAYS: blankToUndefined(env.PROVIDER_USAGE_RETENTION_DAYS),
    MONGODB_MAX_POOL_SIZE: blankToUndefined(env.MONGODB_MAX_POOL_SIZE),
    MONGODB_MIN_POOL_SIZE: blankToUndefined(env.MONGODB_MIN_POOL_SIZE),
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: blankToUndefined(env.MONGODB_SERVER_SELECTION_TIMEOUT_MS),
    MONGODB_CONNECT_TIMEOUT_MS: blankToUndefined(env.MONGODB_CONNECT_TIMEOUT_MS),
    MONGODB_SOCKET_TIMEOUT_MS: blankToUndefined(env.MONGODB_SOCKET_TIMEOUT_MS),
  });
  if (!parsed.success) throw new ConfigError(fieldsFromZod(parsed.error));
  if (parsed.data.MONGODB_MIN_POOL_SIZE > parsed.data.MONGODB_MAX_POOL_SIZE) {
    throw new ConfigError(["MONGODB_MIN_POOL_SIZE"]);
  }

  const retention: RetentionPolicy = {
    gmpDays: parsed.data.GMP_RETENTION_DAYS,
    subscriptionDays: parsed.data.SUBSCRIPTION_RETENTION_DAYS,
    syncHistoryDays: parsed.data.SYNC_HISTORY_RETENTION_DAYS,
    providerUsageDays: parsed.data.PROVIDER_USAGE_RETENTION_DAYS,
  };
  const uri = blankToUndefined(env.MONGODB_URI);
  if (!uri) {
    if (nodeEnv === "production") throw new ConfigError(["MONGODB_URI"]);
    return null;
  }

  const target = parseMongoTarget(uri);
  if (!target) throw new ConfigError(["MONGODB_URI"]);
  const database = target.database ?? (deployment === "production" ? null : "ipo-singh-dev");
  if (!database) throw new ConfigError(["MONGODB_URI"]);
  assertSafeDatabase(deployment, database);

  return seal({
    uri,
    host: target.host,
    database,
    maxPoolSize: parsed.data.MONGODB_MAX_POOL_SIZE,
    minPoolSize: parsed.data.MONGODB_MIN_POOL_SIZE,
    serverSelectionTimeoutMs: parsed.data.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMs: parsed.data.MONGODB_CONNECT_TIMEOUT_MS,
    socketTimeoutMs: parsed.data.MONGODB_SOCKET_TIMEOUT_MS,
    retention,
  });
}
