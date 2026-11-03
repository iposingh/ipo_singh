import type { Board } from "@ipo-singh/contracts";
import { createAccountId } from "../../accounts/tokens.ts";
import { normalizeAccountPreferences } from "../../accounts/session-service.ts";
import type { DatabaseHandle } from "../../db/handle.ts";
import { accountAllowsBoardAlerts, anonymousAllowsBoardAlerts, notificationScopeForBoard } from "../../notifications/eligibility.ts";
import { notificationRetentionMs } from "../../notifications/evaluate.ts";
import type { NotificationStore } from "../../notifications/records.ts";
import { isAnonymousPushOwner } from "../../notifications/push-tokens.ts";
import type { AllotmentNotificationDispatch } from "./types.ts";

export type AllotmentNotifyResult = {
  dispatch: AllotmentNotificationDispatch;
  eligibleDevices: number;
  queuedUsers: number;
};

/**
 * Queue confirmed Allotment Out notifications.
 *
 * Mainboard: global to opted-in registered and anonymous devices (no watchlist).
 * SME: only owners who watchlisted that IPO (registered or anon device watchlist).
 *
 * `ALLOTMENT_BROADCAST_ENABLED=true` is required to queue. Enabling it cannot bypass SME watchlist rules.
 */
export function createAllotmentConfirmNotifier(input: {
  database: DatabaseHandle;
  notifications?: NotificationStore | null;
  broadcastEnabled?: boolean;
  resolveBoard?: (ipoId: string) => Promise<Board | null>;
}): (args: { ipoId: string; companyName: string; slug?: string; board?: Board | null; now: Date }) => Promise<AllotmentNotifyResult> {
  const broadcastEnabled =
    input.broadcastEnabled ?? process.env.ALLOTMENT_BROADCAST_ENABLED === "true";

  return async ({ ipoId, companyName, slug, board: boardHint, now }) => {
    const accounts = input.database.accounts;
    const notifications = input.notifications ?? input.database.notifications;
    const pushTokens = input.database.pushTokens;
    const watchlist = input.database.watchlist;
    const store = input.database.store;
    if (!accounts || !notifications || !pushTokens) {
      return { dispatch: "skipped", eligibleDevices: 0, queuedUsers: 0 };
    }
    if (!broadcastEnabled) {
      return { dispatch: "skipped", eligibleDevices: 0, queuedUsers: 0 };
    }

    let board: Board | null = boardHint ?? null;
    if (!board && input.resolveBoard) board = await input.resolveBoard(ipoId);
    if (!board && store) {
      const ipo = await store.ipos.findById(ipoId);
      board = ipo?.board === "mainboard" || ipo?.board === "sme" ? ipo.board : null;
    }
    const scope = notificationScopeForBoard(board);
    if (scope === "skip" || !board) {
      return { dispatch: "skipped", eligibleDevices: 0, queuedUsers: 0 };
    }

    try {
      const routeId = slug ?? ipoId;
      let eligibleDevices = 0;
      let queuedUsers = 0;

      const ownerIds =
        scope === "watchlist"
          ? watchlist
            ? [...new Set((await watchlist.listByIpo(ipoId, 5_000)).map((row) => row.userId))]
            : []
          : await pushTokens.listActiveUserIds(20_000);

      for (const ownerId of ownerIds) {
        const tokens = await pushTokens.listActive(ownerId);
        if (tokens.length === 0 && scope === "global") continue;

        if (isAnonymousPushOwner(ownerId) || tokens.every((token) => token.ownerKind === "anonymous")) {
          const gateToken = tokens.find((token) => token.ownerKind === "anonymous");
          if (!gateToken) continue;
          if (
            !anonymousAllowsBoardAlerts(
              {
                mainboardGlobalAlerts: gateToken.mainboardGlobalAlerts,
                smeWatchlistAlerts: gateToken.smeWatchlistAlerts,
                allotmentAlertsEnabled: gateToken.allotmentAlertsEnabled,
              },
              board,
              "allotment",
            )
          ) {
            continue;
          }
          if (scope === "watchlist") {
            const saved = watchlist ? await watchlist.find(ownerId, ipoId) : null;
            if (!saved) continue;
          }
          eligibleDevices += tokens.filter((token) => token.ownerKind === "anonymous").length || 1;
        } else {
          const user = await accounts.findUser(ownerId);
          if (!user || user.status !== "active") continue;
          const preferences = normalizeAccountPreferences(user.preferences);
          if (!accountAllowsBoardAlerts(preferences, board, "allotment", { forPush: true })) continue;
          if (scope === "watchlist") {
            const saved = watchlist ? await watchlist.find(ownerId, ipoId) : null;
            if (!saved) continue;
          }
          eligibleDevices += Math.max(tokens.length, 1);
        }

        // Final board gate: SME never queues without watchlist membership (already checked).
        if (scope === "watchlist" && notificationScopeForBoard(board) !== "watchlist") continue;

        const inserted = await notifications.insertIfNew({
          id: createAccountId(),
          userId: ownerId,
          type: "allotment",
          ipoId: routeId,
          title: `Allotment Out: ${companyName}`,
          body: `${companyName} allotment results are available. Tap to check your status on the official registrar website.`,
          createdAt: now,
          readAt: null,
          expiresAt: new Date(now.getTime() + notificationRetentionMs),
          dedupeKey: `ipo-allotment-confirmed:${ipoId}`,
          delivery: { inApp: "delivered", push: "not-sent" },
          source: { name: "registrar-verification", observedAt: now },
        });
        if (inserted === "created") queuedUsers += 1;
      }
      return {
        dispatch: queuedUsers > 0 ? "queued" : "skipped",
        eligibleDevices,
        queuedUsers,
      };
    } catch {
      return { dispatch: "failed", eligibleDevices: 0, queuedUsers: 0 };
    }
  };
}
