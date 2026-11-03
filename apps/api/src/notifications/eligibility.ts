import type { AccountPreferences, Board } from "@ipo-singh/contracts";
import type { NotificationKind } from "./evaluate.ts";

export type RecipientScope = "global" | "watchlist" | "skip";

/** Board field from the stored IPO document — never inferred from slug text. */
export function notificationScopeForBoard(board: Board | null | undefined): RecipientScope {
  if (board === "mainboard") return "global";
  if (board === "sme") return "watchlist";
  return "skip";
}

export type BoardAlertGate = {
  alertsEnabled: boolean;
  mainboardGlobalAlerts: boolean;
  smeWatchlistAlerts: boolean;
  mobilePush?: AccountPreferences["mobilePush"];
  notificationCategories: AccountPreferences["notificationCategories"];
};

/** Signed-in preference gate before board-specific recipient lists are used. */
export function accountAllowsBoardAlerts(
  preferences: BoardAlertGate,
  board: Board,
  category: NotificationKind,
  options?: { forPush?: boolean },
): boolean {
  if (!preferences.alertsEnabled) return false;
  if (options?.forPush && preferences.mobilePush === "off") return false;
  if (!preferences.notificationCategories[category]) return false;
  if (board === "mainboard") return preferences.mainboardGlobalAlerts === true;
  if (board === "sme") return preferences.smeWatchlistAlerts === true;
  return false;
}

export type AnonymousDeviceGate = {
  mainboardGlobalAlerts: boolean;
  smeWatchlistAlerts: boolean;
  allotmentAlertsEnabled: boolean;
};

/** Anonymous installations only receive categories they explicitly enabled on-device. */
export function anonymousAllowsBoardAlerts(
  gate: AnonymousDeviceGate,
  board: Board,
  category: NotificationKind,
): boolean {
  if (board === "mainboard") {
    if (!gate.mainboardGlobalAlerts) return false;
    if (category === "allotment") return gate.allotmentAlertsEnabled !== false;
    // Opening/closing/listing/schedule/gmp/subscription share the mainboard opt-in.
    return category === "open" || category === "closing" || category === "listing" || category === "schedule" || category === "gmp" || category === "subscription";
  }
  if (board === "sme") {
    if (!gate.smeWatchlistAlerts) return false;
    if (category === "allotment") return gate.allotmentAlertsEnabled !== false;
    return category === "open" || category === "closing" || category === "listing" || category === "schedule" || category === "gmp" || category === "subscription";
  }
  return false;
}

/** Priority for Mainboard daily-cap / digest ordering. Higher runs first. */
export function notificationPriority(type: NotificationKind): number {
  if (type === "open" || type === "closing" || type === "listing" || type === "allotment") return 3;
  if (type === "schedule") return 2;
  if (type === "gmp" || type === "subscription") return 1;
  return 0;
}

export function isCriticalMainboardPush(type: NotificationKind): boolean {
  return notificationPriority(type) >= 3;
}
