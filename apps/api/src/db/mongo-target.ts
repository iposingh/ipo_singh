import { ConfigError } from "../shared/errors.ts";
import type { DeploymentEnv } from "../config/deployment.ts";

const mongoUriPattern = /^(mongodb(?:\+srv)?):\/\/(?:[^@/\s]+@)?([^/\s?]+)(?:\/([A-Za-z0-9_-]*))?(?:\?[^#\s]*)?$/i;

export type MongoTarget = {
  host: string;
  /** Null when the URI has no database path. Development then uses ipo-singh-dev. */
  database: string | null;
};

export function parseMongoTarget(uri: string): MongoTarget | null {
  const match = mongoUriPattern.exec(uri);
  if (!match) return null;
  const host = match[2];
  const database = match[3];
  if (!host || host.includes("@")) return null;
  if (database === undefined || database.length === 0) return { host, database: null };
  return { host, database };
}

/**
 * Isolates Mongo database names by deployment lane.
 * - production: refuses names containing dev, test, or staging
 * - other lanes: must include dev, test, or staging; refuse names containing prod
 */
export function assertSafeDatabase(deployment: DeploymentEnv, database: string): void {
  if (deployment === "production") {
    if (/(dev|test|staging)/i.test(database)) {
      throw new ConfigError(["MONGODB_URI"]);
    }
    return;
  }
  if (/prod/i.test(database) || !/(dev|test|staging)/i.test(database)) {
    throw new ConfigError(["MONGODB_URI"]);
  }
}
