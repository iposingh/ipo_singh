import { Router } from "express";
import type { CacheHandle } from "../../cache/connection.ts";
import type { AppConfig } from "../../config/env.ts";
import type { DatabaseHandle } from "../../db/handle.ts";
import { HttpError } from "../../shared/errors.ts";
import type { Logger } from "../../shared/logger.ts";
import { opsTokenMatches } from "../../ops/access.ts";
import { IpoGuruDisabledError, IpoGuruRequestError, type IpoGuruClient } from "../../providers/ipo-guru/client.ts";
import { ProviderOutageError, QuotaExhaustedError } from "../../providers/quota.ts";
import { registerRoute } from "../../shared/typed-route.ts";
import { ipoGuruAccountViewSchema, operationsStatusSchema } from "./schema.ts";
import { buildOperationsStatus } from "./status.ts";

export function createOpsRouter(
  config: AppConfig,
  logger: Logger,
  database: DatabaseHandle,
  cache: CacheHandle,
  ipoGuru: IpoGuruClient,
): Router {
  const router = Router();
  registerRoute(router, {
    method: "get",
    path: "/status",
    response: operationsStatusSchema,
    handler: async ({ req }) => {
      if (!opsTokenMatches(config.opsToken, req.get("x-ops-token"))) {
        throw new HttpError(404, "not_found", "No matching API route was found.");
      }
      logger.info("Operational status read", { requestId: req.id });
      return { status: 200, body: await buildOperationsStatus(config, database, cache, new Date(), ipoGuru) };
    },
  });
  registerRoute(router, {
    method: "get",
    path: "/ipoguru/account",
    response: ipoGuruAccountViewSchema,
    handler: async ({ req }) => {
      if (!opsTokenMatches(config.opsToken, req.get("x-ops-token")) || !config.ipoGuru.enabled) {
        throw new HttpError(404, "not_found", "No matching API route was found.");
      }
      logger.info("IPO Guru account read", { requestId: req.id });
      try {
        const account = await ipoGuru.readAccount();
        return { status: 200, body: account };
      } catch (error) {
        if (error instanceof IpoGuruDisabledError) {
          throw new HttpError(404, "not_found", "No matching API route was found.");
        }
        if (error instanceof QuotaExhaustedError) {
          throw new HttpError(429, "rate_limited", "IPO Guru request budget is exhausted.");
        }
        if (error instanceof ProviderOutageError) {
          throw new HttpError(503, "unavailable", "IPO Guru requests are paused after repeated failures.");
        }
        if (error instanceof IpoGuruRequestError) {
          logger.warn("IPO Guru account request failed", {
            requestId: req.id,
            status: error.httpStatus,
            code: error.vendorCode,
          });
          if (error.httpStatus === 429) throw new HttpError(429, "rate_limited", "IPO Guru rate limit is exhausted.");
          throw new HttpError(503, "unavailable", "IPO Guru account request failed.");
        }
        throw error;
      }
    },
  });
  return router;
}
