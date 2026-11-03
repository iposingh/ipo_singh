import { defaultAccountPreferences, type AccountPreferences } from "@ipo-singh/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryAccountStore } from "../accounts/memory-store.ts";
import type { UserRecord } from "../accounts/records.ts";
import { createUnconfiguredCache } from "../cache/connection.ts";
import { readAlertPolicy } from "../config/alert-policy.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import { createSyncLock } from "../jobs/lock.ts";
import { directoryRowSchema } from "../modules/catalog/present.ts";
import { createLogger } from "../shared/logger.ts";
import { createMemoryAlertCursor, runAlertEvaluation } from "./engine.ts";
import { createMemoryNotificationStore } from "./memory-store.ts";
import { createMemoryPushTokenStore } from "./push-memory-store.ts";
import { createMemoryWatchlistStore } from "../watchlist/memory-store.ts";

const now = new Date("2026-10-23T08:00:00.000Z");
const quiet = createLogger({ level: "error", service: "test", sink: () => undefined });

function prefs(patch: Partial<AccountPreferences> = {}): AccountPreferences {
  return {
    ...defaultAccountPreferences,
    alertsEnabled: true,
    mainboardGlobalAlerts: true,
    smeWatchlistAlerts: true,
    mobilePush: "when-available",
    notificationCategories: {
      ...defaultAccountPreferences.notificationCategories,
      open: true,
      closing: true,
      listing: true,
      allotment: true,
      gmp: true,
      subscription: true,
      schedule: true,
    },
    ...patch,
  };
}

function user(id: string, preferences: AccountPreferences): UserRecord {
  return {
    id,
    email: `${id}@example.com`,
    displayName: null,
    status: "active",
    role: "member",
    preferences,
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    lastAuthenticatedAt: now,
    suspendedAt: null,
    closedAt: null,
    passwordHash: "hash",
  };
}

function catalogueRow(id: string, board: "mainboard" | "sme") {
  return directoryRowSchema.parse({
    summary: {
      id,
      slug: id,
      companyName: id,
      board,
      status: "open",
      openDate: "2026-10-23",
      closeDate: "2026-10-24",
      gmpAmountRupees: null,
      subscriptionTotalTimes: null,
      provenance: { sourceName: "Fixture", retrievedAt: "2026-10-23T04:30:00.000Z", freshness: "fresh" },
    },
    allotmentDate: null,
    listingDate: "2026-10-23",
    symbol: "FX",
  });
}

test("Mainboard opening reaches an opted-in device without a watchlist", async () => {
  const accounts = createMemoryAccountStore();
  const watchlist = createMemoryWatchlistStore();
  const notifications = createMemoryNotificationStore();
  const pushTokens = createMemoryPushTokenStore();
  await accounts.insertUser(user("owner-mb", prefs()));
  await pushTokens.insert({
    id: "tok-1",
    userId: "owner-mb",
    deviceId: "dev-1",
    platform: "ios",
    token: "ExponentPushToken[owner-mb]",
    status: "active",
    ownerKind: "user",
    allotmentAlertsEnabled: true,
    mainboardGlobalAlerts: false,
    smeWatchlistAlerts: false,
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
    invalidAt: null,
  });
  const emptyStore = {
    gmp: { async findByIpos() { return []; }, async findByIpo() { return []; } },
    subscriptions: { async findByIpos() { return []; }, async findByIpo() { return []; } },
  } as unknown as PersistenceStore;
  const database: DatabaseHandle = {
    async check() { return "ok"; },
    async close() { return undefined; },
    store: emptyStore,
    accounts,
    watchlist,
    notifications,
    pushTokens,
  };
  const result = await runAlertEvaluation({
    database,
    cache: createUnconfiguredCache(defaultCachePolicy(), defaultQuotaPolicy(), quiet),
    locks: createSyncLock(null, { allowProcessLocal: true }),
    cursor: createMemoryAlertCursor(),
    mainboardCursor: createMemoryAlertCursor(),
    policy: readAlertPolicy({}),
    logger: quiet,
    now,
    sleep: async () => undefined,
    loadRows: async () => [catalogueRow("main-ipo", "mainboard")],
  });
  assert.equal(result.status, "ran");
  const items = await notifications.listForUser("owner-mb", now);
  assert.equal(items.some((item) => item.type === "open" && item.ipoId === "main-ipo"), true);
  assert.equal(items.some((item) => item.type === "listing"), true);
});

test("SME opening requires a matching watchlist entry", async () => {
  const accounts = createMemoryAccountStore();
  const watchlist = createMemoryWatchlistStore();
  const notifications = createMemoryNotificationStore();
  const pushTokens = createMemoryPushTokenStore();
  await accounts.insertUser(user("owner-sme", prefs({ mainboardGlobalAlerts: false })));
  await pushTokens.insert({
    id: "tok-2",
    userId: "owner-sme",
    deviceId: "dev-2",
    platform: "ios",
    token: "ExponentPushToken[owner-sme]",
    status: "active",
    ownerKind: "user",
    allotmentAlertsEnabled: true,
    mainboardGlobalAlerts: false,
    smeWatchlistAlerts: false,
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
    invalidAt: null,
  });
  const emptyStore = {
    gmp: { async findByIpos() { return []; }, async findByIpo() { return []; } },
    subscriptions: { async findByIpos() { return []; }, async findByIpo() { return []; } },
  } as unknown as PersistenceStore;
  const database: DatabaseHandle = {
    async check() { return "ok"; },
    async close() { return undefined; },
    store: emptyStore,
    accounts,
    watchlist,
    notifications,
    pushTokens,
  };
  await runAlertEvaluation({
    database,
    cache: createUnconfiguredCache(defaultCachePolicy(), defaultQuotaPolicy(), quiet),
    locks: createSyncLock(null, { allowProcessLocal: true }),
    cursor: createMemoryAlertCursor(),
    mainboardCursor: createMemoryAlertCursor(),
    policy: readAlertPolicy({}),
    logger: quiet,
    now,
    sleep: async () => undefined,
    loadRows: async () => [catalogueRow("sme-ipo", "sme")],
  });
  assert.equal((await notifications.listForUser("owner-sme", now)).length, 0);

  await watchlist.save({ id: "w1", userId: "owner-sme", ipoId: "sme-ipo", addedAt: now, note: null }, false);
  await runAlertEvaluation({
    database,
    cache: createUnconfiguredCache(defaultCachePolicy(), defaultQuotaPolicy(), quiet),
    locks: createSyncLock(null, { allowProcessLocal: true }),
    cursor: createMemoryAlertCursor(),
    mainboardCursor: createMemoryAlertCursor(),
    policy: readAlertPolicy({}),
    logger: quiet,
    now,
    sleep: async () => undefined,
    loadRows: async () => [catalogueRow("sme-ipo", "sme")],
  });
  const items = await notifications.listForUser("owner-sme", now);
  assert.equal(items.some((item) => item.type === "open" && item.ipoId === "sme-ipo"), true);
});

test("new Mainboard global preference defaults off", () => {
  assert.equal(defaultAccountPreferences.mainboardGlobalAlerts, false);
  assert.equal(defaultAccountPreferences.smeWatchlistAlerts, false);
});

test("opted-out Mainboard owners receive no notices; deep links use the public slug", async () => {
  const accounts = createMemoryAccountStore();
  const watchlist = createMemoryWatchlistStore();
  const notifications = createMemoryNotificationStore();
  const pushTokens = createMemoryPushTokenStore();
  await accounts.insertUser(user("owner-off", prefs({ mainboardGlobalAlerts: false })));
  await accounts.insertUser(user("owner-on", prefs()));
  for (const id of ["owner-off", "owner-on"] as const) {
    await pushTokens.insert({
      id: `tok-${id}`,
      userId: id,
      deviceId: `dev-${id}`,
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
    });
  }
  const emptyStore = {
    gmp: { async findByIpos() { return []; }, async findByIpo() { return []; } },
    subscriptions: { async findByIpos() { return []; }, async findByIpo() { return []; } },
  } as unknown as PersistenceStore;
  const database: DatabaseHandle = {
    async check() { return "ok"; },
    async close() { return undefined; },
    store: emptyStore,
    accounts,
    watchlist,
    notifications,
    pushTokens,
  };
  const row = directoryRowSchema.parse({
    summary: {
      id: "internal-main",
      slug: "public-main-slug",
      companyName: "Public Main",
      board: "mainboard",
      status: "open",
      openDate: "2026-10-22",
      closeDate: "2026-10-23",
      gmpAmountRupees: null,
      subscriptionTotalTimes: null,
      provenance: { sourceName: "Fixture", retrievedAt: "2026-10-23T04:30:00.000Z", freshness: "fresh" },
    },
    allotmentDate: null,
    listingDate: null,
    symbol: "FX",
  });
  await runAlertEvaluation({
    database,
    cache: createUnconfiguredCache(defaultCachePolicy(), defaultQuotaPolicy(), quiet),
    locks: createSyncLock(null, { allowProcessLocal: true }),
    cursor: createMemoryAlertCursor(),
    mainboardCursor: createMemoryAlertCursor(),
    policy: readAlertPolicy({}),
    logger: quiet,
    now,
    sleep: async () => undefined,
    loadRows: async () => [row],
  });
  assert.equal((await notifications.listForUser("owner-off", now)).length, 0);
  const on = await notifications.listForUser("owner-on", now);
  assert.equal(on.some((item) => item.type === "closing" && item.ipoId === "public-main-slug"), true);
});
