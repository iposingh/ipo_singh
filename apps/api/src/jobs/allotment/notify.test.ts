import assert from "node:assert/strict";
import test from "node:test";
import { defaultAccountPreferences, type AccountPreferences } from "@ipo-singh/contracts";
import type { UserRecord } from "../../accounts/records.ts";
import type { DatabaseHandle } from "../../db/handle.ts";
import { createMemoryNotificationStore } from "../../notifications/memory-store.ts";
import { createMemoryPushTokenStore } from "../../notifications/push-memory-store.ts";
import type { PushTokenRecord } from "../../notifications/push-records.ts";
import { anonymousPushOwnerId } from "../../notifications/push-tokens.ts";
import { createMemoryWatchlistStore } from "../../watchlist/memory-store.ts";
import { createAllotmentConfirmNotifier } from "./notify.ts";

function prefs(input: {
  allotment?: boolean;
  mainboard?: boolean;
  sme?: boolean;
  mobilePush?: AccountPreferences["mobilePush"];
}): AccountPreferences {
  return {
    ...defaultAccountPreferences,
    alertsEnabled: true,
    mainboardGlobalAlerts: input.mainboard ?? false,
    smeWatchlistAlerts: input.sme ?? false,
    mobilePush: input.mobilePush ?? "when-available",
    notificationCategories: {
      ...defaultAccountPreferences.notificationCategories,
      allotment: input.allotment ?? true,
    },
  };
}

function user(
  id: string,
  options: { allotment?: boolean; mainboard?: boolean; sme?: boolean; mobilePush?: AccountPreferences["mobilePush"] } = {},
): UserRecord {
  const now = new Date("2026-10-01T00:00:00.000Z");
  return {
    id,
    email: `${id}@example.com`,
    displayName: id,
    status: "active",
    role: "member",
    preferences: prefs(options),
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    lastAuthenticatedAt: null,
    suspendedAt: null,
    closedAt: null,
    passwordHash: null,
  };
}

function token(userId: string, id: string, extras: Partial<PushTokenRecord> = {}): PushTokenRecord {
  const now = new Date("2026-10-01T00:00:00.000Z");
  return {
    id,
    userId,
    deviceId: `device-${id}`,
    platform: "android",
    token: `ExponentPushToken[${id}]`,
    status: "active",
    ownerKind: "user",
    allotmentAlertsEnabled: true,
    mainboardGlobalAlerts: false,
    smeWatchlistAlerts: false,
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
    invalidAt: null,
    ...extras,
  };
}

test("Mainboard Allotment Out reaches opted-in owners without a watchlist", async () => {
  const notifications = createMemoryNotificationStore();
  const pushTokens = createMemoryPushTokenStore();
  const watchlist = createMemoryWatchlistStore();
  await pushTokens.insert(token("u1", "t1"));
  await pushTokens.insert(token("u2", "t2"));
  const users = new Map([
    ["u1", user("u1", { mainboard: true })],
    ["u2", user("u2", { mainboard: false })],
  ]);
  const database = {
    accounts: { async findUser(id: string) { return users.get(id) ?? null; } },
    pushTokens,
    notifications,
    watchlist,
  } as unknown as DatabaseHandle;

  const notify = createAllotmentConfirmNotifier({ database, notifications, broadcastEnabled: true });
  const first = await notify({
    ipoId: "ipo-1",
    companyName: "Fixture Polymers",
    board: "mainboard",
    now: new Date("2026-10-08T15:30:00.000Z"),
  });
  assert.equal(first.dispatch, "queued");
  assert.equal(first.queuedUsers, 1);
  assert.equal((await notifications.listForUser("u1", new Date("2026-10-08T16:00:00.000Z")))[0]?.title, "Allotment Out: Fixture Polymers");
  assert.equal((await notifications.listForUser("u2", new Date("2026-10-08T16:00:00.000Z"))).length, 0);
});

test("SME Allotment Out requires a matching watchlist entry and cannot go global", async () => {
  const notifications = createMemoryNotificationStore();
  const pushTokens = createMemoryPushTokenStore();
  const watchlist = createMemoryWatchlistStore();
  await pushTokens.insert(token("watcher", "tw"));
  await pushTokens.insert(token("stranger", "ts"));
  await watchlist.save(
    { id: "w1", userId: "watcher", ipoId: "sme-1", addedAt: new Date(), note: null },
    false,
  );
  const users = new Map([
    ["watcher", user("watcher", { sme: true })],
    ["stranger", user("stranger", { sme: true, mainboard: true })],
  ]);
  const database = {
    accounts: { async findUser(id: string) { return users.get(id) ?? null; } },
    pushTokens,
    notifications,
    watchlist,
  } as unknown as DatabaseHandle;

  const notify = createAllotmentConfirmNotifier({ database, notifications, broadcastEnabled: true });
  const result = await notify({
    ipoId: "sme-1",
    companyName: "SME Co",
    board: "sme",
    now: new Date("2026-10-08T15:30:00.000Z"),
  });
  assert.equal(result.dispatch, "queued");
  assert.equal(result.queuedUsers, 1);
  assert.equal((await notifications.listForUser("watcher", new Date("2026-10-08T16:00:00.000Z"))).length, 1);
  assert.equal((await notifications.listForUser("stranger", new Date("2026-10-08T16:00:00.000Z"))).length, 0);
});

test("unknown board cannot queue a global Allotment Out even when broadcast is enabled", async () => {
  const notifications = createMemoryNotificationStore();
  const pushTokens = createMemoryPushTokenStore();
  await pushTokens.insert(token("u1", "t1"));
  const database = {
    accounts: { async findUser() { return user("u1", { mainboard: true }); } },
    pushTokens,
    notifications,
    store: { ipos: { async findById() { return null; } } },
  } as unknown as DatabaseHandle;
  const notify = createAllotmentConfirmNotifier({ database, notifications, broadcastEnabled: true });
  const result = await notify({ ipoId: "ipo-x", companyName: "Unknown", now: new Date() });
  assert.equal(result.dispatch, "skipped");
});

test("broadcast stays skipped when the rollout switch is off", async () => {
  const notifications = createMemoryNotificationStore();
  const pushTokens = createMemoryPushTokenStore();
  await pushTokens.insert(token("u1", "t1"));
  const database = {
    accounts: { async findUser() { return user("u1", { mainboard: true }); } },
    pushTokens,
    notifications,
  } as unknown as DatabaseHandle;
  const notify = createAllotmentConfirmNotifier({ database, notifications, broadcastEnabled: false });
  const result = await notify({ ipoId: "ipo-1", companyName: "Fixture Polymers", board: "mainboard", now: new Date() });
  assert.equal(result.dispatch, "skipped");
});

test("anonymous Mainboard allotment uses device opt-in; SME anon needs watchlist", async () => {
  const notifications = createMemoryNotificationStore();
  const pushTokens = createMemoryPushTokenStore();
  const watchlist = createMemoryWatchlistStore();
  const anon = anonymousPushOwnerId("018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f");
  await pushTokens.insert(
    token(anon, "anon1", {
      ownerKind: "anonymous",
      deviceId: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f",
      mainboardGlobalAlerts: true,
      allotmentAlertsEnabled: true,
    }),
  );
  const database = {
    accounts: { async findUser() { return null; } },
    pushTokens,
    notifications,
    watchlist,
  } as unknown as DatabaseHandle;
  const notify = createAllotmentConfirmNotifier({ database, notifications, broadcastEnabled: true });
  const mainboard = await notify({
    ipoId: "mb-1",
    companyName: "Main Co",
    board: "mainboard",
    now: new Date("2026-10-08T15:30:00.000Z"),
  });
  assert.equal(mainboard.queuedUsers, 1);

  const smeMissing = await notify({
    ipoId: "sme-1",
    companyName: "SME Co",
    board: "sme",
    now: new Date("2026-10-08T15:31:00.000Z"),
  });
  assert.equal(smeMissing.queuedUsers, 0);

  await pushTokens.save({
    ...(await pushTokens.findByToken("ExponentPushToken[anon1]"))!,
    smeWatchlistAlerts: true,
  });
  await watchlist.save({ id: "w-anon", userId: anon, ipoId: "sme-1", addedAt: new Date(), note: null }, false);
  const smeOk = await notify({
    ipoId: "sme-1",
    companyName: "SME Co",
    board: "sme",
    now: new Date("2026-10-08T15:32:00.000Z"),
  });
  assert.equal(smeOk.queuedUsers, 1);
});
