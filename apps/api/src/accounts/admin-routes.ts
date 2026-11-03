import {
  adminAccountResponseSchema,
  adminAuditListSchema,
  adminManualSyncRequestSchema,
  adminManualSyncResultSchema,
  adminProviderStatusSchema,
  adminRevokeResultSchema,
  adminRoleChangeRequestSchema,
  adminSessionRevokeRequestSchema,
  type AccountRole,
  type AdminAuditAction,
  type AdminManualSyncResult,
} from "@ipo-singh/contracts";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { CacheHandle } from "../cache/connection.ts";
import type { AppConfig } from "../config/env.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import { HttpError } from "../shared/errors.ts";
import type { Logger } from "../shared/logger.ts";
import { mountAdminAllotmentRoutes } from "./admin-allotment.ts";
import type { AdminAuditStore } from "./audit.ts";
import { assessManualCatalogSync, runBoundedCatalogSync } from "./catalog-sync.ts";
import { buildAdminDashboard, listAdminIpos, listAdminSyncRuns } from "./dashboard.ts";
import { requireRole } from "./middleware.ts";
import type { PasswordHasher } from "./passwords.ts";
import { loadProviderAccountSnapshot, redactedProviderStatus } from "./provider-view.ts";
import type { IpoGuruClient } from "../providers/ipo-guru/client.ts";
import type { AccountStore } from "./records.ts";
import { toPublicAccount } from "./session-service.ts";
import { createAccountId } from "./tokens.ts";

const administrators = ["admin", "super-admin"] as const satisfies readonly AccountRole[];
const superAdministrators = ["super-admin"] as const satisfies readonly AccountRole[];

export type AdminRouterDeps = {
  readStore: () => AccountStore | undefined;
  readAudit: () => AdminAuditStore | undefined;
  readDatabase: () => DatabaseHandle;
  cache: CacheHandle;
  hasher: PasswordHasher;
  logger: Logger;
  config: AppConfig;
  ipoGuru?: IpoGuruClient;
  /** Test seam. The default runs one catalogue call after the quota and production checks. */
  runCatalogSync?: () => Promise<AdminManualSyncResult>;
};

function storeOrThrow(readStore: () => AccountStore | undefined): AccountStore {
  const store = readStore();
  if (!store) throw new HttpError(503, "unavailable", "Administration is temporarily unavailable.");
  return store;
}

function actorId(req: Request): string {
  if (req.auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
  return req.auth.userId;
}

async function record(
  deps: AdminRouterDeps,
  event: {
    actorUserId: string;
    action: AdminAuditAction;
    outcome: "succeeded" | "denied";
    targetUserId: string | null;
  },
): Promise<void> {
  const audit = deps.readAudit();
  if (!audit) throw new HttpError(503, "unavailable", "Administration is temporarily unavailable.");
  await audit.insert({
    id: createAccountId(),
    actorUserId: event.actorUserId,
    action: event.action,
    outcome: event.outcome,
    targetUserId: event.targetUserId,
    createdAt: new Date(),
  });
  deps.logger.info("admin_audit", {
    action: event.action,
    outcome: event.outcome,
    actorUserId: event.actorUserId,
    targetUserId: event.targetUserId,
  });
}

function protect(deps: AdminRouterDeps, allowed: readonly AccountRole[]) {
  const gate = requireRole(allowed);
  return (req: Request, res: Response, next: NextFunction): void => {
    gate(req, res, (error) => {
      if (error instanceof HttpError && error.status === 403 && req.auth?.kind === "user") {
        void record(deps, {
          actorUserId: req.auth.userId,
          action: "access_denied",
          outcome: "denied",
          targetUserId: null,
        })
          .then(() => next(error))
          .catch((auditError: unknown) => next(auditError));
        return;
      }
      next(error);
    });
  };
}

async function confirmPassword(store: AccountStore, hasher: PasswordHasher, userId: string, password: string): Promise<boolean> {
  const actor = await store.findUser(userId);
  if (!actor?.passwordHash) return false;
  return hasher.verify(password, actor.passwordHash);
}

export function createAdminRouter(deps: AdminRouterDeps): Router {
  const router = Router();
  router.get("/session", protect(deps, administrators), (req, res, next) => {
    void session(req, res, next, deps);
  });
  router.get("/provider", protect(deps, superAdministrators), (req, res, next) => {
    void provider(req, res, next, deps);
  });
  router.get("/audit", protect(deps, superAdministrators), (req, res, next) => {
    void auditList(req, res, next, deps);
  });
  router.post("/roles", protect(deps, superAdministrators), (req, res, next) => {
    void changeRole(req, res, next, deps);
  });
  router.post("/sessions/revoke", protect(deps, superAdministrators), (req, res, next) => {
    void revokeSessions(req, res, next, deps);
  });
  router.get("/dashboard", protect(deps, administrators), (req, res, next) => {
    void dashboard(req, res, next, deps);
  });
  router.get("/ipos", protect(deps, administrators), (req, res, next) => {
    void inspectIpos(req, res, next, deps);
  });
  router.get("/sync", protect(deps, administrators), (req, res, next) => {
    void syncHistory(req, res, next, deps);
  });
  router.post("/sync", protect(deps, superAdministrators), (req, res, next) => {
    void manualSync(req, res, next, deps);
  });
  mountAdminAllotmentRoutes(router, {
    readStore: deps.readStore,
    readAudit: deps.readAudit,
    readDatabase: deps.readDatabase,
    cache: deps.cache,
    hasher: deps.hasher,
    logger: deps.logger,
    protect: (allowed) => protect(deps, allowed),
    confirmPassword,
    actorId,
    record: async (event) => {
      await record(deps, event);
    },
  });
  return router;
}

async function dashboard(_req: Request, res: Response, next: NextFunction, deps: AdminRouterDeps): Promise<void> {
  try {
    res.json(
      await buildAdminDashboard({
        config: deps.config,
        database: deps.readDatabase(),
        cache: deps.cache,
        ipoGuru: deps.ipoGuru,
      }),
    );
  } catch (error) {
    next(error);
  }
}

async function inspectIpos(req: Request, res: Response, next: NextFunction, deps: AdminRouterDeps): Promise<void> {
  try {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    if (query.length > 0 && !/^[a-z0-9-]{1,40}$/.test(query)) {
      throw new HttpError(400, "validation_error", "Request validation failed.");
    }
    const listed = await listAdminIpos({ database: deps.readDatabase(), query });
    res.json(listed);
  } catch (error) {
    next(error);
  }
}

async function syncHistory(_req: Request, res: Response, next: NextFunction, deps: AdminRouterDeps): Promise<void> {
  try {
    res.json(await listAdminSyncRuns({ database: deps.readDatabase(), provider: deps.config.provider }));
  } catch (error) {
    next(error);
  }
}

async function manualSync(req: Request, res: Response, next: NextFunction, deps: AdminRouterDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readStore);
    const actor = actorId(req);
    const parsed = adminManualSyncRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "validation_error", "Request validation failed.");
    if (!(await confirmPassword(store, deps.hasher, actor, parsed.data.currentPassword))) {
      await record(deps, { actorUserId: actor, action: "manual_sync", outcome: "denied", targetUserId: null });
      throw new HttpError(403, "forbidden", "Check the current password and try again.");
    }
    const quota = await deps.cache.quota.snapshot();
    const decision = assessManualCatalogSync({
      nodeEnv: deps.config.nodeEnv,
      provider: deps.config.provider,
      ipoGuruEnabled: deps.config.ipoGuru.enabled,
      minuteUsed: quota.minuteUsed,
      minuteLimit: deps.config.quota.requestsPerMinute,
      dayUsed: quota.dayUsed,
      dayLimit: deps.config.quota.requestsPerDay,
      reservedRequests: deps.config.quota.reservedRequests,
    });
    if (decision !== "allowed") {
      await record(deps, { actorUserId: actor, action: "manual_sync", outcome: "denied", targetUserId: null });
      if (decision === "production") throw new HttpError(403, "forbidden", "Manual synchronization is disabled in production.");
      if (decision === "quota") throw new HttpError(429, "rate_limited", "The provider quota has no remaining requests.");
      if (decision === "unknown_quota") throw new HttpError(503, "unavailable", "Provider usage is unavailable, so synchronization was not started.");
      throw new HttpError(503, "unavailable", "The provider is not configured.");
    }
    let result: AdminManualSyncResult;
    try {
      result = adminManualSyncResultSchema.parse(
        await (deps.runCatalogSync ??
          (() =>
            runBoundedCatalogSync({
              config: deps.config,
              database: deps.readDatabase(),
              cache: deps.cache,
              logger: deps.logger,
              ipoGuru: deps.ipoGuru,
            })))(),
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, "unavailable", "Synchronization did not finish.");
    }
    await record(deps, { actorUserId: actor, action: "manual_sync", outcome: "succeeded", targetUserId: null });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function session(req: Request, res: Response, next: NextFunction, deps: AdminRouterDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readStore);
    const user = await store.findUser(actorId(req));
    if (!user || (user.role !== "admin" && user.role !== "super-admin")) {
      throw new HttpError(403, "forbidden", "You do not have access to this page.");
    }
    res.json(adminAccountResponseSchema.parse({ account: toPublicAccount(user) }));
  } catch (error) {
    next(error);
  }
}

async function provider(req: Request, res: Response, next: NextFunction, deps: AdminRouterDeps): Promise<void> {
  try {
    await record(deps, {
      actorUserId: actorId(req),
      action: "provider_read",
      outcome: "succeeded",
      targetUserId: null,
    });
    const account = await loadProviderAccountSnapshot(deps.ipoGuru, deps.config.ipoGuru.enabled);
    res.json(adminProviderStatusSchema.parse(redactedProviderStatus(deps.config, account)));
  } catch (error) {
    next(error);
  }
}

async function auditList(req: Request, res: Response, next: NextFunction, deps: AdminRouterDeps): Promise<void> {
  try {
    const audit = deps.readAudit();
    if (!audit) throw new HttpError(503, "unavailable", "Administration is temporarily unavailable.");
    const events = await audit.listRecent(50);
    res.json(
      adminAuditListSchema.parse({
        events: events.map((event) => ({
          id: event.id,
          actorUserId: event.actorUserId,
          action: event.action,
          outcome: event.outcome,
          targetUserId: event.targetUserId,
          createdAt: event.createdAt.toISOString(),
        })),
      }),
    );
  } catch (error) {
    next(error);
  }
}

async function changeRole(req: Request, res: Response, next: NextFunction, deps: AdminRouterDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readStore);
    const actor = actorId(req);
    const parsed = adminRoleChangeRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "validation_error", "Request validation failed.");
    if (!(await confirmPassword(store, deps.hasher, actor, parsed.data.currentPassword))) {
      await record(deps, { actorUserId: actor, action: "role_change", outcome: "denied", targetUserId: parsed.data.userId });
      throw new HttpError(403, "forbidden", "Check the current password and try again.");
    }
    const target = await store.findUser(parsed.data.userId);
    if (!target) throw new HttpError(404, "not_found", "That account was not found.");
    if (target.role === "super-admin" && parsed.data.role !== "super-admin" && (await store.countRole("super-admin")) <= 1) {
      await record(deps, { actorUserId: actor, action: "role_change", outcome: "denied", targetUserId: target.id });
      throw new HttpError(403, "forbidden", "Keep at least one super admin.");
    }
    if (parsed.data.userId === actor) {
      await record(deps, { actorUserId: actor, action: "role_change", outcome: "denied", targetUserId: actor });
      throw new HttpError(403, "forbidden", "You cannot change your own role.");
    }
    const now = new Date();
    await store.saveUser({ ...target, role: parsed.data.role, updatedAt: now });
    await record(deps, { actorUserId: actor, action: "role_change", outcome: "succeeded", targetUserId: target.id });
    const saved = await store.findUser(target.id);
    if (!saved) throw new HttpError(503, "unavailable", "Administration is temporarily unavailable.");
    res.json(adminAccountResponseSchema.parse({ account: toPublicAccount(saved) }));
  } catch (error) {
    next(error);
  }
}

async function revokeSessions(req: Request, res: Response, next: NextFunction, deps: AdminRouterDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readStore);
    const actor = actorId(req);
    const parsed = adminSessionRevokeRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "validation_error", "Request validation failed.");
    if (!(await confirmPassword(store, deps.hasher, actor, parsed.data.currentPassword))) {
      await record(deps, { actorUserId: actor, action: "session_revoke", outcome: "denied", targetUserId: parsed.data.userId });
      throw new HttpError(403, "forbidden", "Check the current password and try again.");
    }
    if (parsed.data.userId === actor) {
      await record(deps, { actorUserId: actor, action: "session_revoke", outcome: "denied", targetUserId: actor });
      throw new HttpError(403, "forbidden", "Use sign-out to end your own session.");
    }
    const target = await store.findUser(parsed.data.userId);
    if (!target) throw new HttpError(404, "not_found", "That account was not found.");
    await store.revokeSessionsForUser(target.id, new Date(), "operator");
    await record(deps, { actorUserId: actor, action: "session_revoke", outcome: "succeeded", targetUserId: target.id });
    res.json(adminRevokeResultSchema.parse({ revoked: true }));
  } catch (error) {
    next(error);
  }
}
