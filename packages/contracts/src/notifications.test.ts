import assert from "node:assert/strict";
import test from "node:test";
import {
  notificationSchema,
  registerDevicePushTokenSchema,
  registerPushTokenSchema,
  unreadNotificationCountSchema,
  updateAlertPreferencesSchema,
  updateDevicePushPreferencesSchema,
} from "./notifications.ts";

const item = {
  id: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f",
  type: "gmp",
  ipoId: "fixture-mills",
  title: "GMP changed",
  body: "Unofficial GMP changed from ₹15 to ₹30. This is not a recommendation or a listing forecast.",
  createdAt: "2026-10-23T04:30:00.000Z",
  readAt: null,
  expiresAt: "2026-11-22T04:30:00.000Z",
  delivery: { inApp: "delivered", push: "not-sent" },
};

test("a notification stays in-app and rejects delivery secrets", () => {
  const parsed = notificationSchema.parse(item);
  assert.equal(parsed.delivery.push, "not-sent");
  assert.equal(notificationSchema.safeParse({ ...item, delivery: { inApp: "delivered", push: "sent" } }).success, true);
  assert.equal(notificationSchema.safeParse({ ...item, delivery: { inApp: "delivered", push: "failed" } }).success, true);
  assert.equal(notificationSchema.safeParse({ ...item, delivery: { inApp: "delivered", push: "skipped" } }).success, true);
  assert.equal(notificationSchema.safeParse({ ...item, email: "person@example.com" }).success, false);
  assert.equal(notificationSchema.safeParse({ ...item, delivery: { inApp: "delivered", push: "sent", sms: true } }).success, false);
  assert.equal(unreadNotificationCountSchema.parse({ unreadCount: 0 }).unreadCount, 0);
});

test("alert preferences reject a push token and another user id", () => {
  assert.equal(updateAlertPreferencesSchema.parse({ alertsEnabled: true, notificationCategories: { gmp: true } }).notificationCategories?.gmp, true);
  assert.equal(updateAlertPreferencesSchema.safeParse({ alertsEnabled: true, pushToken: "secret" }).success, false);
  assert.equal(updateAlertPreferencesSchema.safeParse({ userId: item.id, alertsEnabled: true }).success, false);
  assert.equal(updateAlertPreferencesSchema.safeParse({ email: "person@example.com" }).success, false);
  assert.equal(registerPushTokenSchema.safeParse({ token: "ExponentPushToken[abcdefghijklmnop]", platform: "ios", email: "person@example.com" }).success, false);
  assert.equal(registerPushTokenSchema.safeParse({ token: "ExponentPushToken[abcdefghijklmnop]", platform: "ios" }).success, true);
});

test("anonymous device push registration accepts an installation id and rejects PAN or email fields", () => {
  const installationId = "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f";
  assert.equal(
    registerDevicePushTokenSchema.safeParse({
      installationId,
      token: "ExponentPushToken[abcdefghijklmnop]",
      platform: "android",
      allotmentAlertsEnabled: true,
    }).success,
    true,
  );
  assert.equal(
    registerDevicePushTokenSchema.safeParse({
      installationId,
      token: "ExponentPushToken[abcdefghijklmnop]",
      platform: "android",
      pan: "ABCDE1234F",
    }).success,
    false,
  );
  assert.equal(
    registerDevicePushTokenSchema.safeParse({
      installationId,
      token: "ExponentPushToken[abcdefghijklmnop]",
      platform: "android",
      email: "person@example.com",
    }).success,
    false,
  );
  assert.equal(
    updateDevicePushPreferencesSchema.safeParse({ installationId, allotmentAlertsEnabled: false }).success,
    true,
  );
});
