import mongoose from "mongoose";
import type { AppConfig } from "../config/env.ts";
import type { Logger } from "../shared/logger.ts";
import type { DatabaseHandle } from "./handle.ts";
import { ensureIndexes } from "./models/index.ts";
import { parseMongoTarget, assertSafeDatabase } from "./mongo-target.ts";
import { createMongoAdminAuditStore } from "../accounts/audit-mongo-store.ts";
import { createMongoAccountStore } from "../accounts/mongo-store.ts";
import { createMongoNotificationStore } from "../notifications/mongo-store.ts";
import { createMongoPushTokenStore } from "../notifications/push-mongo-store.ts";
import { createMongoPromotionStore } from "../promotions/mongo-store.ts";
import { createMongoWatchlistStore } from "../watchlist/mongo-store.ts";
import { createMongoStore } from "./mongo-store.ts";
import { PersistenceError } from "./persistence-error.ts";
import type { PersistenceStore } from "./repositories.ts";
import { ConfigError } from "../shared/errors.ts";

export type ConnectedDatabase = DatabaseHandle & {
  store: PersistenceStore;
  accounts: NonNullable<DatabaseHandle["accounts"]>;
};

export async function connectDatabase(config: AppConfig, logger: Logger): Promise<ConnectedDatabase> {
  const mongo = config.mongodb;
  if (!mongo) throw new PersistenceError("Database is not configured.");
  const target = parseMongoTarget(mongo.uri);
  const database = target?.database ?? (config.deployment === "production" ? null : "ipo-singh-dev");
  if (!target || database !== mongo.database || target.host !== mongo.host) {
    throw new PersistenceError("Database connection failed.");
  }
  assertSafeDatabase(config.deployment, mongo.database);

  mongoose.set("strictQuery", true);
  mongoose.set("bufferCommands", false);
  try {
    await mongoose.connect(mongo.uri, {
      dbName: mongo.database,
      maxPoolSize: mongo.maxPoolSize,
      minPoolSize: mongo.minPoolSize,
      serverSelectionTimeoutMS: mongo.serverSelectionTimeoutMs,
      connectTimeoutMS: mongo.connectTimeoutMs,
      socketTimeoutMS: mongo.socketTimeoutMs,
      appName: config.serviceName,
    });
    await ensureIndexes();
  } catch (error) {
    await mongoose.disconnect().catch(() => undefined);
    if (error instanceof PersistenceError || error instanceof ConfigError) throw error;
    logger.error("Database connection failed", {
      detail: error instanceof Error ? error.message : "unknown",
    });
    throw new PersistenceError("Database connection failed.");
  }

  logger.info("Database connected", { host: mongo.host, database: mongo.database });
  let closed = false;
  return {
    store: createMongoStore(mongo.retention),
    accounts: createMongoAccountStore(),
    adminAudit: createMongoAdminAuditStore(),
    watchlist: createMongoWatchlistStore(),
    notifications: createMongoNotificationStore(),
    pushTokens: createMongoPushTokenStore(),
    promotions: createMongoPromotionStore(),
    async check() {
      if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return "unavailable";
      try {
        await mongoose.connection.db.command({ ping: 1 });
        return "ok";
      } catch (error) {
        logger.error("Database readiness failed", {
          detail: error instanceof Error ? error.message : "unknown",
        });
        return "unavailable";
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      await mongoose.disconnect();
    },
  };
}
