import { formatIstDateTime } from "@ipo-singh/core";
import { Router } from "express";
import type { CacheCheck, CacheHandle } from "../../cache/connection.ts";
import { createUnconfiguredCache } from "../../cache/connection.ts";
import type { AppConfig } from "../../config/env.ts";
import type { DatabaseCheck, DatabaseHandle } from "../../db/handle.ts";
import { jobsStatus } from "../../jobs/index.ts";
import { providerStatus } from "../../providers/index.ts";
import type { Logger } from "../../shared/logger.ts";
import { redactString } from "../../shared/redact.ts";
import type { AppState } from "../../shared/state.ts";
import { registerRoute } from "../../shared/typed-route.ts";
import { healthResponseSchema, readyResponseSchema } from "./schema.ts";

const readinessCheckTimeoutMs = 2_000;

function observedAt(): { timestamp: string; timestampIst: string } {
  const now = new Date();
  return {
    timestamp: now.toISOString(),
    timestampIst: formatIstDateTime(now),
  };
}

async function readWithin<T>(check: () => Promise<T>, fallback: T, failedMessage: string, logger: Logger): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const work = check().catch((error: unknown) => {
    logger.error(failedMessage, {
      detail: redactString(error instanceof Error ? error.message : "unknown"),
    });
    return fallback;
  });
  try {
    const status = await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve(fallback);
        }, readinessCheckTimeoutMs);
      }),
    ]);
    if (timedOut) logger.error(`${failedMessage} timed out`);
    return status;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readDatabase(database: DatabaseHandle, logger: Logger): Promise<DatabaseCheck> {
  return readWithin(() => database.check(), "unavailable", "Database readiness failed", logger);
}

async function readCache(cache: CacheHandle, logger: Logger): Promise<CacheCheck> {
  return readWithin(() => cache.check(), "unavailable", "Cache readiness failed", logger);
}

export function createHealthRouter(
  config: AppConfig,
  state: AppState,
  logger: Logger,
  database: DatabaseHandle,
  cache: CacheHandle = createUnconfiguredCache(config.cache, config.quota, logger),
): Router {
  const router = Router();

  registerRoute(router, {
    method: "get",
    path: "/health",
    response: healthResponseSchema,
    handler: () => ({
      status: 200,
      body: {
        status: "ok",
        service: config.serviceName,
        version: config.version,
        ...observedAt(),
      },
    }),
  });

  registerRoute(router, {
    method: "get",
    path: "/ready",
    response: readyResponseSchema,
    handler: async () => {
      const accepting = state.accepting;
      const databaseCheck = await readDatabase(database, logger);
      const cacheCheck = await readCache(cache, logger);
      const databaseBlocksReadiness =
        databaseCheck === "unavailable" || (databaseCheck === "not_configured" && config.nodeEnv === "production");
      // A missing cache degrades to origin reads. It does not take the API out of service.
      const ready = accepting && !databaseBlocksReadiness;
      return {
        status: ready ? 200 : 503,
        body: {
          status: ready ? "ready" : "not_ready",
          service: config.serviceName,
          version: config.version,
          ...observedAt(),
          checks: {
            process: accepting ? "ok" : "shutting_down",
            database: databaseCheck,
            cache: cacheCheck,
            provider: providerStatus,
            jobs: jobsStatus,
          },
        },
      };
    },
  });

  return router;
}
