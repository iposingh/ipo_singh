import {
  accountIdSchema,
  devicePushPreferencesSchema,
  deviceWatchlistRemoveSchema,
  deviceWatchlistSaveSchema,
  notificationListSchema,
  notificationSchema,
  pushTokenRegistrationSchema,
  registerDevicePushTokenSchema,
  registerPushTokenSchema,
  revokeDevicePushTokenSchema,
  revokePushTokenSchema,
  unreadNotificationCountSchema,
  updateAlertPreferencesSchema,
  updateDevicePushPreferencesSchema,
  watchlistMembershipSchema,
  type NotificationItem,
} from "@ipo-singh/contracts";
import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAccount } from "../accounts/middleware.ts";
import { updatePreferences } from "../accounts/profile.ts";
import { AccountStateError, normalizeAccountPreferences, toPublicAccount } from "../accounts/session-service.ts";
import type { CacheHandle } from "../cache/connection.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import { CursorError, decodeCursor, pageOf } from "../modules/catalog/query.ts";
import { HttpError } from "../shared/errors.ts";
import type { Logger } from "../shared/logger.ts";
import { createAccountId } from "../accounts/tokens.ts";
import {
  anonymousPushOwnerId,
  registerAnonymousPushToken,
  registerPushToken,
  revokeOwnedPushToken,
  updateAnonymousDevicePreferences,
} from "./push-tokens.ts";
import { syncUserNotifications } from "./sync.ts";
import type { NotificationRecord } from "./records.ts";
import { watchlistItemLimit } from "../watchlist/records.ts";

const pageLimit = 20;

export type NotificationRouterDeps = {
  database: DatabaseHandle;
  cache: CacheHandle;
  logger: Logger;
  /** False after the IPO Guru subscription ends. New alerts then have no catalogue to read. */
  catalogueVisible?: boolean;
};

function withAccount(req: Request, res: Response, next: NextFunction, run: () => Promise<void>): void {
  requireAccount(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }
    void run().catch(next);
  });
}

function userId(req: Request): string {
  return signedIn(req).userId;
}

function signedIn(req: Request): { userId: string; deviceId: string; client: "web" | "ios" | "android" } {
  if (req.auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
  return { userId: req.auth.userId, deviceId: req.auth.deviceId, client: req.auth.client };
}

function present(record: NotificationRecord): NotificationItem {
  return notificationSchema.parse({
    id: record.id,
    type: record.type,
    ipoId: record.ipoId,
    title: record.title,
    body: record.body,
    createdAt: record.createdAt.toISOString(),
    readAt: record.readAt ? record.readAt.toISOString() : null,
    expiresAt: record.expiresAt.toISOString(),
    delivery: record.delivery,
  });
}

function one(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

async function ready(deps: NotificationRouterDeps, owner: string) {
  const accounts = deps.database.accounts;
  if (!accounts || !deps.database.notifications) throw new HttpError(503, "unavailable", "Notifications are temporarily unavailable.");
  const user = await accounts.findUser(owner);
  if (!user || user.status !== "active") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
  const preferences = normalizeAccountPreferences(user.preferences);
  const notifications = await syncUserNotifications({
    database: deps.database,
    cache: deps.cache,
    logger: deps.logger,
    userId: owner,
    preferences,
    catalogueVisible: deps.catalogueVisible !== false,
  });
  return { accounts, preferences, notifications };
}

export function createNotificationRouter(deps: NotificationRouterDeps): Router {
  const router = Router();

  /** Unsigned-in Expo installations may register for Mainboard global and SME watchlist pushes. */
  router.post("/device-push-tokens", (req, res, next) => {
    void (async () => {
      const parsed = registerDevicePushTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [
          { field: "token", message: "Register a phone token with a device installation id." },
        ]);
      }
      const pushTokens = deps.database.pushTokens;
      if (!pushTokens) throw new HttpError(503, "unavailable", "Notifications are temporarily unavailable.");
      await registerAnonymousPushToken(pushTokens, {
        installationId: parsed.data.installationId,
        platform: parsed.data.platform,
        token: parsed.data.token,
        allotmentAlertsEnabled: parsed.data.allotmentAlertsEnabled,
        mainboardGlobalAlerts: parsed.data.mainboardGlobalAlerts,
        smeWatchlistAlerts: parsed.data.smeWatchlistAlerts,
      });
      deps.logger.info("account_audit", {
        event: "anonymous_push_token_registered",
        outcome: "succeeded",
        installationId: parsed.data.installationId,
      });
      res.status(200).json(pushTokenRegistrationSchema.parse({ registered: true }));
    })().catch(next);
  });

  router.delete("/device-push-tokens", (req, res, next) => {
    void (async () => {
      const parsed = revokeDevicePushTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [
          { field: "token", message: "That phone token is not valid." },
        ]);
      }
      const pushTokens = deps.database.pushTokens;
      if (!pushTokens) throw new HttpError(503, "unavailable", "Notifications are temporarily unavailable.");
      const revoked = await revokeOwnedPushToken(
        pushTokens,
        anonymousPushOwnerId(parsed.data.installationId),
        parsed.data.token,
      );
      if (!revoked) throw new HttpError(404, "not_found", "That phone token was not found.");
      deps.logger.info("account_audit", {
        event: "anonymous_push_token_revoked",
        outcome: "succeeded",
        installationId: parsed.data.installationId,
      });
      res.status(204).end();
    })().catch(next);
  });

  router.patch("/device-push-tokens/preferences", (req, res, next) => {
    void (async () => {
      const parsed = updateDevicePushPreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [
          { field: "preferences", message: "Those alert choices are not valid." },
        ]);
      }
      const pushTokens = deps.database.pushTokens;
      if (!pushTokens) throw new HttpError(503, "unavailable", "Notifications are temporarily unavailable.");
      const updated = await updateAnonymousDevicePreferences(pushTokens, {
        installationId: parsed.data.installationId,
        allotmentAlertsEnabled: parsed.data.allotmentAlertsEnabled,
        mainboardGlobalAlerts: parsed.data.mainboardGlobalAlerts,
        smeWatchlistAlerts: parsed.data.smeWatchlistAlerts,
      });
      if (!updated) throw new HttpError(404, "not_found", "That device installation was not found.");
      deps.logger.info("account_audit", {
        event: "anonymous_push_preferences",
        outcome: "succeeded",
        installationId: parsed.data.installationId,
      });
      res.status(200).json(devicePushPreferencesSchema.parse(updated));
    })().catch(next);
  });

  /** Guest device watchlist for SME eligibility. Owner id is anon:<installationId>. */
  router.post("/device-watchlist", (req, res, next) => {
    void (async () => {
      const parsed = deviceWatchlistSaveSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [
          { field: "ipoId", message: "Save a stored IPO id for this installation." },
        ]);
      }
      const watchlist = deps.database.watchlist;
      if (!watchlist) throw new HttpError(503, "unavailable", "The watchlist is temporarily unavailable.");
      const owner = anonymousPushOwnerId(parsed.data.installationId);
      const existing = await watchlist.find(owner, parsed.data.ipoId);
      if (!existing && (await watchlist.listForUser(owner)).length >= watchlistItemLimit) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [
          { field: "ipoId", message: "The watchlist already has 200 issues." },
        ]);
      }
      const saved = await watchlist.save(
        {
          id: existing?.id ?? createAccountId(),
          userId: owner,
          ipoId: parsed.data.ipoId,
          addedAt: existing?.addedAt ?? new Date(),
          note: existing?.note ?? null,
        },
        false,
      );
      res.status(200).json(
        watchlistMembershipSchema.parse({
          ipoId: saved.ipoId,
          saved: true,
          addedAt: saved.addedAt.toISOString(),
          note: saved.note,
        }),
      );
    })().catch(next);
  });

  router.delete("/device-watchlist", (req, res, next) => {
    void (async () => {
      const parsed = deviceWatchlistRemoveSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [
          { field: "ipoId", message: "Remove a stored IPO id for this installation." },
        ]);
      }
      const watchlist = deps.database.watchlist;
      if (!watchlist) throw new HttpError(503, "unavailable", "The watchlist is temporarily unavailable.");
      const removed = await watchlist.remove(anonymousPushOwnerId(parsed.data.installationId), parsed.data.ipoId);
      if (!removed) throw new HttpError(404, "not_found", "That watchlist row was not found.");
      res.status(204).end();
    })().catch(next);
  });

  router.get("/unread-count", (req, res, next) => {
    withAccount(req, res, next, async () => {
      const owner = userId(req);
      const { notifications } = await ready(deps, owner);
      const unreadCount = await notifications.countUnread(owner, new Date());
      res.status(200).json(unreadNotificationCountSchema.parse({ unreadCount }));
    });
  });

  router.get("/", (req, res, next) => {
    withAccount(req, res, next, async () => {
      const owner = userId(req);
      const { notifications } = await ready(deps, owner);
      const limitText = one(req.query.limit);
      const limit = limitText === undefined ? pageLimit : Number(limitText);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "limit", message: "Choose a page size from 1 to 50." }]);
      }
      let offset = 0;
      try {
        offset = decodeCursor(one(req.query.cursor));
      } catch (error) {
        if (error instanceof CursorError) {
          throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "cursor", message: "That page cursor is not valid." }]);
        }
        throw error;
      }
      const rows = await notifications.listForUser(owner, new Date());
      const page = pageOf(rows.map(present), offset, limit, false);
      res.status(200).json(notificationListSchema.parse(page));
    });
  });

  router.post("/push-tokens", (req, res, next) => {
    withAccount(req, res, next, async () => {
      const auth = signedIn(req);
      const parsed = registerPushTokenSchema.safeParse(req.body);
      if (!parsed.success || auth.client !== parsed.data?.platform) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "token", message: "Register the phone token from the signed-in device." }]);
      }
      const pushTokens = deps.database.pushTokens;
      if (!pushTokens || !deps.database.accounts) throw new HttpError(503, "unavailable", "Notifications are temporarily unavailable.");
      const user = await deps.database.accounts.findUser(auth.userId);
      if (!user || user.status !== "active") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
      await registerPushToken(pushTokens, {
        userId: auth.userId,
        deviceId: auth.deviceId,
        platform: parsed.data.platform,
        token: parsed.data.token,
      });
      deps.logger.info("account_audit", { event: "push_token_registered", outcome: "succeeded", userId: auth.userId });
      res.status(200).json(pushTokenRegistrationSchema.parse({ registered: true }));
    });
  });

  router.delete("/push-tokens", (req, res, next) => {
    withAccount(req, res, next, async () => {
      const auth = signedIn(req);
      const parsed = revokePushTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "token", message: "That phone token is not valid." }]);
      }
      const pushTokens = deps.database.pushTokens;
      if (!pushTokens) throw new HttpError(503, "unavailable", "Notifications are temporarily unavailable.");
      const revoked = await revokeOwnedPushToken(pushTokens, auth.userId, parsed.data.token);
      if (!revoked) throw new HttpError(404, "not_found", "That phone token was not found.");
      deps.logger.info("account_audit", { event: "push_token_revoked", outcome: "succeeded", userId: auth.userId });
      res.status(204).end();
    });
  });

  router.post("/read-all", (req, res, next) => {
    withAccount(req, res, next, async () => {
      const owner = userId(req);
      const { notifications } = await ready(deps, owner);
      const marked = await notifications.markAllRead(owner, new Date());
      deps.logger.info("account_audit", { event: "notifications_read_all", outcome: "succeeded", userId: owner });
      res.status(200).json({ marked });
    });
  });

  router.post("/:id/read", (req, res, next) => {
    withAccount(req, res, next, async () => {
      const owner = userId(req);
      const parsed = accountIdSchema.safeParse(one(req.params.id));
      if (!parsed.success) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "id", message: "Choose a notification." }]);
      }
      const { notifications } = await ready(deps, owner);
      const saved = await notifications.markRead(owner, parsed.data, new Date());
      if (!saved) throw new HttpError(404, "not_found", "That notification was not found.");
      deps.logger.info("account_audit", { event: "notification_read", outcome: "succeeded", userId: owner });
      res.status(200).json(present(saved));
    });
  });

  router.patch("/preferences", (req, res, next) => {
    withAccount(req, res, next, async () => {
      const owner = userId(req);
      const parsed = updateAlertPreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "preferences", message: "Those alert choices are not valid." }]);
      }
      const accounts = deps.database.accounts;
      if (!accounts) throw new HttpError(503, "unavailable", "Notifications are temporarily unavailable.");
      try {
        const user = await updatePreferences(accounts, owner, parsed.data);
        deps.logger.info("account_audit", { event: "alert_preferences", outcome: "succeeded", userId: owner });
        res.status(200).json({ account: toPublicAccount(user) });
      } catch (error) {
        if (error instanceof AccountStateError) {
          throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "preferences", message: "Those alert choices are not valid." }]);
        }
        throw error;
      }
    });
  });

  return router;
}
