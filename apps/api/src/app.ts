import express, { type Express } from "express";
import { createLoginAttemptLimiter, type LoginAttemptLimiter } from "./accounts/attempts.ts";
import { createAuthMiddleware, createCookieCsrf } from "./accounts/middleware.ts";
import type { AdminManualSyncResult } from "@ipo-singh/contracts";
import { createArgon2Hasher, type PasswordHasher } from "./accounts/passwords.ts";
import { createAdminRouter } from "./accounts/admin-routes.ts";
import { createAuthRouter } from "./accounts/routes.ts";
import { createUnconfiguredCache, type CacheHandle } from "./cache/connection.ts";
import type { AppConfig } from "./config/env.ts";
import { unconfiguredDatabase, type DatabaseHandle } from "./db/handle.ts";
import { createCors } from "./middleware/cors.ts";
import { errorHandler } from "./middleware/error-handler.ts";
import { notFound } from "./middleware/not-found.ts";
import { createRateLimiter } from "./middleware/rate-limit.ts";
import { requestId } from "./middleware/request-id.ts";
import { requestLogger } from "./middleware/request-logger.ts";
import { rejectPrivateRequestBody, rejectUnsafeRequestTarget } from "./middleware/request-guards.ts";
import { securityHeaders } from "./middleware/security.ts";
import { createCatalogRouter } from "./modules/catalog/routes.ts";
import { createNotificationRouter } from "./notifications/routes.ts";
import { ipoGuruCatalogueVisible } from "./config/ipoguru.ts";
import { createWatchlistRouter } from "./watchlist/routes.ts";
import { createHealthRouter } from "./modules/health/routes.ts";
import { createOpsRouter } from "./modules/ops/routes.ts";
import { createArticleAdminRouter } from "./content/admin-routes.ts";
import { createArticleRouter } from "./content/routes.ts";
import { createBannerAdminRouter } from "./promotions/admin-routes.ts";
import { createPromotionRouter } from "./promotions/routes.ts";
import { createIpoGuruClient, type IpoGuruClient } from "./providers/ipo-guru/client.ts";
import type { CounterStore, CacheStore } from "./cache/store.ts";
import { assertDeferredModules } from "./modules/registry.ts";
import type { Logger } from "./shared/logger.ts";
import type { AppState } from "./shared/state.ts";

export function createApp(
  config: AppConfig,
  logger: Logger,
  state: AppState,
  database: DatabaseHandle = unconfiguredDatabase,
  cache: CacheHandle = createUnconfiguredCache(config.cache, config.quota, logger),
  ipoGuru: IpoGuruClient = createIpoGuruClient({
    settings: config.ipoGuru,
    quotaPolicy: config.quota,
    logger,
    counters: countersFrom(cache),
  }),
  accounts: { hasher?: PasswordHasher; attempts?: LoginAttemptLimiter; runCatalogSync?: () => Promise<AdminManualSyncResult> } = {},
): Express {
  assertDeferredModules();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy ? 1 : false);
  app.set("query parser", "simple");
  app.use(requestId);
  app.use(securityHeaders(config.nodeEnv === "production"));
  app.use(createCors(config.corsOrigins));
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(rejectUnsafeRequestTarget);
  app.use(requestLogger(logger));
  app.use(express.json({ limit: config.requestBodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: config.requestBodyLimit, parameterLimit: 20 }));
  app.use(rejectPrivateRequestBody);
  app.use(createRateLimiter(config.rateLimit, { internalServiceToken: config.internalServiceToken }));
  app.use(createAuthMiddleware(() => database.accounts));
  app.use(createCookieCsrf());
  app.use(
    "/api/v1/auth",
    createAuthRouter({
      readStore: () => database.accounts,
      hasher: accounts.hasher ?? createArgon2Hasher(),
      attempts: accounts.attempts ?? createLoginAttemptLimiter(),
      logger,
      secureCookies: config.nodeEnv === "production",
      revokePushTokens: database.pushTokens
        ? async (input) => {
            await database.pushTokens?.revokeActive(input);
          }
        : undefined,
      clearAccountData: database.watchlist
        ? async (userId) => {
            const rows = await database.watchlist?.listForUser(userId);
            if (!rows) return;
            for (const row of rows) await database.watchlist?.remove(userId, row.ipoId);
          }
        : undefined,
    }),
  );
  app.use("/api/v1", createHealthRouter(config, state, logger, database, cache));
  app.use("/api/v1", createCatalogRouter(config, logger, database, cache));
  const catalogueVisible = ipoGuruCatalogueVisible(config);
  app.use("/api/v1/watchlist", createWatchlistRouter({ database, cache, logger, catalogueVisible }));
  app.use("/api/v1/notifications", createNotificationRouter({ database, cache, logger, catalogueVisible }));
  app.use(
    "/api/v1/admin",
    createAdminRouter({
      readStore: () => database.accounts,
      readAudit: () => database.adminAudit,
      readDatabase: () => database,
      cache,
      hasher: accounts.hasher ?? createArgon2Hasher(),
      logger,
      config,
      ipoGuru,
      runCatalogSync: accounts.runCatalogSync,
    }),
  );
  app.use(
    "/api/v1/admin",
    createBannerAdminRouter({
      readDatabase: () => database,
      readAudit: () => database.adminAudit,
      logger,
    }),
  );
  app.use("/api/v1/promotions", createPromotionRouter(() => database));
  app.use("/api/v1/articles", createArticleRouter(() => database));
  app.use(
    "/api/v1/admin",
    createArticleAdminRouter({
      readDatabase: () => database,
      readAudit: () => database.adminAudit,
      logger,
    }),
  );
  app.use("/internal", createOpsRouter(config, logger, database, cache, ipoGuru));
  app.use(notFound);
  app.use(errorHandler(logger, { production: config.nodeEnv === "production" }));
  return app;
}

function countersFrom(cache: CacheHandle): CounterStore | undefined {
  const store = cache.store;
  if (!store || !("increment" in store) || !("read" in store)) return undefined;
  const candidate = store as CacheStore & CounterStore;
  if (typeof candidate.increment !== "function" || typeof candidate.read !== "function") return undefined;
  return {
    increment: (key, ttlMs) => candidate.increment(key, ttlMs),
    read: (key) => candidate.read(key),
  };
}
