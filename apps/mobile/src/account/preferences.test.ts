import assert from "node:assert/strict";
import test from "node:test";
import {
  accountSessionResponseSchema,
  defaultAccountPreferences,
  mobileSecureStoreKeys,
  updateAccountPreferencesSchema,
  type AccountPreferences,
  type PublicAccount,
} from "@ipo-singh/contracts";
import { createAuthSession } from "../auth/session.ts";
import { createMemorySecretStore } from "../auth/secrets.ts";
import {
  accountPreferencesPath,
  applyPreferencePatch,
  createPreferenceController,
  notificationCategoryOptions,
  preferenceStatusMessage,
  primaryNotificationCategoryKeys,
  guestThemeClaim,
  themePatchForAccount,
} from "./preferences.ts";

const origin = "https://api.example.com";
const access = "a".repeat(43);
const refresh = "b".repeat(43);
const otherAccess = "c".repeat(43);
const otherRefresh = "d".repeat(43);

function account(preferences: AccountPreferences = defaultAccountPreferences): PublicAccount {
  return {
    id: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f",
    email: "phone@example.com",
    displayName: "Phone Reader",
    status: "active",
    role: "member",
    preferences,
    createdAt: "2026-10-26T04:00:00.000Z",
    updatedAt: "2026-10-26T04:00:00.000Z",
    statusChangedAt: "2026-10-26T04:00:00.000Z",
    lastAuthenticatedAt: "2026-10-26T04:00:00.000Z",
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("preference updates stay on the account and a second device reads them", async () => {
  let stored = account();
  const bodies: unknown[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    assert.equal(url.includes("ipoguru"), false);
    if (url.endsWith(accountPreferencesPath)) {
      assert.equal(init?.method, "PATCH");
      const body: unknown = JSON.parse(String(init?.body));
      bodies.push(body);
      assert.equal(JSON.stringify(body).includes("pushToken"), false);
      assert.equal(JSON.stringify(body).includes("passwordHash"), false);
      const parsed = updateAccountPreferencesSchema.parse(body);
      stored = account(applyPreferencePatch(stored.preferences, parsed));
      return json(200, { account: stored });
    }
    if (url.endsWith("/api/v1/auth/session")) {
      return json(200, accountSessionResponseSchema.parse({ account: stored, sessions: [], devices: [] }));
    }
    return json(404, { code: "not_found", message: "Missing." });
  };

  const phoneStore = createMemorySecretStore();
  await phoneStore.set(mobileSecureStoreKeys.access, access);
  await phoneStore.set(mobileSecureStoreKeys.refresh, refresh);
  const phone = createAuthSession({ store: phoneStore, origin, client: "ios", fetchImpl });
  const preferences = createPreferenceController((input) => phone.authorized(input), defaultAccountPreferences);
  const saved = await preferences.update({
    colorScheme: "dark",
    defaultBoard: "sme",
    alertsEnabled: true,
    notificationCategories: { gmp: true, closing: true },
    mobilePush: "when-available",
  });
  assert.equal(saved.status, "ready");
  if (saved.status !== "ready") return;
  assert.equal(saved.value.preferences.colorScheme, "dark");
  assert.equal(saved.value.preferences.defaultBoard, "sme");
  assert.equal(saved.value.preferences.alertsEnabled, true);
  assert.equal(saved.value.preferences.notificationCategories.gmp, true);
  assert.equal(saved.value.preferences.notificationCategories.open, false);
  assert.equal(saved.value.preferences.mobilePush, "when-available");
  assert.equal(saved.value.preferences.timeZone, "Asia/Kolkata");
  assert.equal(preferences.current().colorScheme, "dark");

  const websiteStore = createMemorySecretStore();
  await websiteStore.set(mobileSecureStoreKeys.access, otherAccess);
  await websiteStore.set(mobileSecureStoreKeys.refresh, otherRefresh);
  const website = createAuthSession({ store: websiteStore, origin, client: "android", fetchImpl });
  const seen = await website.authorized({ path: "/api/v1/auth/session", schema: accountSessionResponseSchema });
  assert.equal(seen.status, "ready");
  if (seen.status !== "ready") return;
  assert.equal(seen.value.account.preferences.colorScheme, "dark");
  assert.equal(seen.value.account.preferences.defaultBoard, "sme");
  assert.equal(seen.value.account.preferences.mobilePush, "when-available");
  assert.equal(bodies.length, 1);
});

test("an invalid or failed preference change does not stick and a guest theme stays local", async () => {
  let calls = 0;
  const controller = createPreferenceController(async () => {
    calls += 1;
    return { status: "rejected", message: "Preferences could not be saved." };
  }, defaultAccountPreferences);
  const rejected = await controller.update({ pushToken: "device-token", colorScheme: "dark" });
  assert.equal(rejected.status, "rejected");
  assert.equal(calls, 0);
  assert.equal(controller.current().colorScheme, "system");

  const failed = await controller.update({ colorScheme: "dark" });
  assert.equal(failed.status, "rejected");
  assert.equal(calls, 1);
  assert.equal(controller.current().colorScheme, "system");
  assert.equal(preferenceStatusMessage("rejected", "Preferences could not be saved."), "Preferences could not be saved.");

  const offline = createPreferenceController(async () => ({ status: "offline" }), defaultAccountPreferences);
  const optimistic = applyPreferencePatch(defaultAccountPreferences, { alertsEnabled: true });
  assert.equal(optimistic.alertsEnabled, true);
  const rolled = await offline.update({ alertsEnabled: true });
  assert.equal(rolled.status, "offline");
  assert.equal(offline.current().alertsEnabled, false);
  assert.equal(themePatchForAccount("signed-out", "dark"), null);
  assert.equal(themePatchForAccount("offline", "dark"), null);
  assert.deepEqual(themePatchForAccount("ready", "dark"), { colorScheme: "dark" });
  assert.deepEqual(guestThemeClaim("system", "dark"), { colorScheme: "dark" });
  assert.equal(guestThemeClaim("light", "dark"), null);
  assert.equal(guestThemeClaim("system", "system"), null);
});

test("core notification preferences cover opening, closing, allotment results, and listing", () => {
  assert.deepEqual(primaryNotificationCategoryKeys, ["open", "closing", "allotment", "listing"]);
  const byKey = new Map(notificationCategoryOptions.map((option) => [option.key, option.label]));
  assert.equal(byKey.get("open"), "IPO opening reminders");
  assert.equal(byKey.get("closing"), "IPO closing reminders");
  assert.equal(byKey.get("allotment"), "Allotment results");
  assert.equal(byKey.get("listing"), "Listing updates");
  assert.equal(updateAccountPreferencesSchema.safeParse({ notificationCategories: { open: true }, pushToken: "secret" }).success, false);
  assert.equal(JSON.stringify(notificationCategoryOptions).toLowerCase().includes("email"), false);
});

test("Mainboard and SME alert channels default off and update independently", async () => {
  assert.equal(defaultAccountPreferences.mainboardGlobalAlerts, false);
  assert.equal(defaultAccountPreferences.smeWatchlistAlerts, false);
  let stored = account();
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body: unknown = JSON.parse(String(init?.body));
    const parsed = updateAccountPreferencesSchema.parse(body);
    stored = account(applyPreferencePatch(stored.preferences, parsed));
    return json(200, { account: stored });
  };
  const store = createMemorySecretStore();
  await store.set(mobileSecureStoreKeys.access, access);
  await store.set(mobileSecureStoreKeys.refresh, refresh);
  const session = createAuthSession({ store, origin, client: "android", fetchImpl });
  const preferences = createPreferenceController((input) => session.authorized(input), defaultAccountPreferences);
  const mainboard = await preferences.update({ mainboardGlobalAlerts: true });
  assert.equal(mainboard.status, "ready");
  assert.equal(preferences.current().mainboardGlobalAlerts, true);
  assert.equal(preferences.current().smeWatchlistAlerts, false);
  const sme = await preferences.update({ smeWatchlistAlerts: true, mainboardGlobalAlerts: false });
  assert.equal(sme.status, "ready");
  assert.equal(preferences.current().mainboardGlobalAlerts, false);
  assert.equal(preferences.current().smeWatchlistAlerts, true);
  const optedOut = await preferences.update({ alertsEnabled: false });
  assert.equal(optedOut.status, "ready");
  assert.equal(preferences.current().alertsEnabled, false);
});
