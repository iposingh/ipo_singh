import assert from "node:assert/strict";
import test from "node:test";
import { defaultAccountPreferences } from "@ipo-singh/contracts";
import {
  accountAllowsBoardAlerts,
  anonymousAllowsBoardAlerts,
  notificationScopeForBoard,
} from "./eligibility.ts";

test("board scope never infers from slug text", () => {
  assert.equal(notificationScopeForBoard("mainboard"), "global");
  assert.equal(notificationScopeForBoard("sme"), "watchlist");
  assert.equal(notificationScopeForBoard(null), "skip");
  assert.equal(notificationScopeForBoard(undefined), "skip");
});

test("mainboard global stays off until opted in; SME uses watchlist channel", () => {
  const base = {
    ...defaultAccountPreferences,
    alertsEnabled: true,
    mainboardGlobalAlerts: false,
    smeWatchlistAlerts: true,
    notificationCategories: { ...defaultAccountPreferences.notificationCategories, open: true, allotment: true },
  };
  assert.equal(accountAllowsBoardAlerts(base, "mainboard", "open"), false);
  assert.equal(accountAllowsBoardAlerts({ ...base, mainboardGlobalAlerts: true }, "mainboard", "open"), true);
  assert.equal(accountAllowsBoardAlerts(base, "sme", "open"), true);
  assert.equal(accountAllowsBoardAlerts({ ...base, smeWatchlistAlerts: false }, "sme", "open"), false);
});

test("anonymous devices follow the same board gates", () => {
  const gate = { mainboardGlobalAlerts: true, smeWatchlistAlerts: false, allotmentAlertsEnabled: true };
  assert.equal(anonymousAllowsBoardAlerts(gate, "mainboard", "open"), true);
  assert.equal(anonymousAllowsBoardAlerts(gate, "sme", "open"), false);
  assert.equal(anonymousAllowsBoardAlerts({ ...gate, allotmentAlertsEnabled: false }, "mainboard", "allotment"), false);
});
