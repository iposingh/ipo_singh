import assert from "node:assert/strict";
import test from "node:test";
import { AccountSessionModel } from "../db/models/account-session.ts";
import { AccountDeviceModel } from "../db/models/device.ts";
import { AccountUserModel } from "../db/models/user.ts";
import { NotificationBaselineModel, NotificationModel } from "../db/models/notification.ts";
import { WatchlistModel } from "../db/models/watchlist.ts";

test("account identity indexes are unique and sessions are not expired by TTL", () => {
  const users = AccountUserModel.schema.indexes();
  const email = users.find(([fields]) => fields.email === 1);
  assert.equal(email?.[1]?.unique, true);
  assert.deepEqual(email?.[1]?.partialFilterExpression, { email: { $type: "string" } });
  assert.ok(users.some(([fields]) => fields.status === 1));

  const devices = AccountDeviceModel.schema.indexes();
  assert.ok(devices.some(([fields]) => fields.userId === 1 && fields.lastSeenAt === -1));

  const sessions = AccountSessionModel.schema.indexes();
  const access = sessions.find(([fields]) => fields.accessTokenHash === 1);
  const refresh = sessions.find(([fields]) => fields.refreshTokenHash === 1);
  const previous = sessions.find(([fields]) => fields.previousRefreshTokenHash === 1);
  assert.equal(access?.[1]?.unique, true);
  assert.equal(refresh?.[1]?.unique, true);
  assert.equal(previous?.[1]?.unique, undefined);
  assert.ok(sessions.some(([fields]) => fields.userId === 1 && fields.revokedAt === 1));
  assert.equal(sessions.some(([, options]) => options?.expireAfterSeconds !== undefined), false);
  assert.equal(AccountUserModel.collection.collectionName, "account_users");
  assert.equal(AccountDeviceModel.collection.collectionName, "account_devices");
  assert.equal(AccountSessionModel.collection.collectionName, "account_sessions");

  const saved = WatchlistModel.schema.indexes();
  const pair = saved.find(([fields]) => fields.userId === 1 && fields.ipoId === 1);
  assert.equal(pair?.[1]?.unique, true);
  assert.equal(WatchlistModel.collection.collectionName, "watchlist_items");

  const notices = NotificationModel.schema.indexes();
  const dedupe = notices.find(([fields]) => fields.userId === 1 && fields.dedupeKey === 1);
  assert.equal(dedupe?.[1]?.unique, true);
  const retention = notices.find(([fields]) => fields.expiresAt === 1);
  assert.equal(retention?.[1]?.expireAfterSeconds, 0);
  assert.equal(NotificationModel.collection.collectionName, "notifications");
  const baselines = NotificationBaselineModel.schema.indexes();
  const seen = baselines.find(([fields]) => fields.userId === 1 && fields.ipoId === 1);
  assert.equal(seen?.[1]?.unique, true);
});
