import assert from "node:assert/strict";
import test from "node:test";
import {
  accountPasswordIssue,
  accountRoleSchema,
  accountSessionResponseSchema,
  authCookieNames,
  defaultAccountPreferences,
  mobileRefreshRequestSchema,
  mobileSecureStoreKeys,
  mobileSessionGrantSchema,
  publicAccountSchema,
  registerAccountRequestSchema,
  updateAccountPreferencesSchema,
  updateDisplayNameSchema,
} from "./account.ts";

const account = {
  id: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f",
  email: "person@example.com",
  displayName: "A Reader",
  status: "active" as const,
  role: "member" as const,
  preferences: defaultAccountPreferences,
  createdAt: "2026-10-23T12:00:00.000Z",
  updatedAt: "2026-10-23T12:00:00.000Z",
  statusChangedAt: "2026-10-23T12:00:00.000Z",
  lastAuthenticatedAt: null,
};

test("a public account keeps preferences and rejects identity secrets", () => {
  const parsed = publicAccountSchema.parse({ ...account, email: " Person@Example.com " });
  assert.equal(parsed.email, "person@example.com");
  assert.deepEqual(parsed.preferences.timeZone, "Asia/Kolkata");
  assert.equal(accountRoleSchema.safeParse("admin").success, true);
  assert.equal(accountRoleSchema.safeParse("super-admin").success, true);
  assert.equal(accountRoleSchema.safeParse("operator").success, false);
  assert.equal(publicAccountSchema.safeParse({ ...account, role: "super-admin" }).success, true);
  assert.equal(
    registerAccountRequestSchema.safeParse({
      email: "person@example.com",
      password: "Horse-battery-99",
      role: "admin",
    }).success,
    false,
  );
  assert.equal(
    registerAccountRequestSchema.safeParse({
      email: "person@example.com",
      password: "Horse-battery-99",
      installationId: account.id,
    }).success,
    true,
  );
  assert.equal(
    registerAccountRequestSchema.safeParse({
      email: "person@example.com",
      password: "Horse-battery-99",
      installationId: "not-a-uuid",
    }).success,
    false,
  );
  assert.equal(publicAccountSchema.safeParse({ ...account, pan: "ABCDE1234F" }).success, false);
  assert.equal(publicAccountSchema.safeParse({ ...account, accessToken: "secret" }).success, false);
  assert.equal(publicAccountSchema.safeParse({ ...account, brokerClientId: "hidden" }).success, false);
});

test("preference updates reject secrets and another person id", () => {
  assert.equal(updateAccountPreferencesSchema.safeParse({ colorScheme: "dark", passwordHash: "hidden" }).success, false);
  assert.equal(updateDisplayNameSchema.safeParse({ displayName: "A Reader", userId: defaultAccountPreferences }).success, false);
  assert.equal(updateAccountPreferencesSchema.parse({ alertsEnabled: true }).alertsEnabled, true);
  assert.equal(updateAccountPreferencesSchema.safeParse({ ...defaultAccountPreferences }).success, true);
  assert.equal(updateAccountPreferencesSchema.safeParse({ timeZone: "UTC" }).success, false);
  assert.equal(defaultAccountPreferences.mobilePush, "off");
  assert.equal(defaultAccountPreferences.mainboardGlobalAlerts, false);
  assert.equal(defaultAccountPreferences.smeWatchlistAlerts, false);
  assert.equal(defaultAccountPreferences.timeZone, "Asia/Kolkata");
});

test("a new password needs length, a letter, and a number", () => {
  assert.equal(accountPasswordIssue("short"), "Use 12 to 128 characters.");
  assert.equal(accountPasswordIssue("longenoughbut"), "Include a letter and a number.");
  assert.equal(accountPasswordIssue("person-password-1", "person@example.com"), "Do not include your email in the password.");
  assert.equal(accountPasswordIssue("Horse-battery-99", "person@example.com"), null);
});

test("the session response does not carry token material", () => {
  const parsed = accountSessionResponseSchema.parse({
    account,
    sessions: [
      {
        id: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9a",
        deviceId: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9b",
        client: "web",
        createdAt: "2026-10-23T12:00:00.000Z",
        accessExpiresAt: "2026-10-23T12:15:00.000Z",
        refreshExpiresAt: "2026-11-22T12:00:00.000Z",
        revokedAt: null,
        current: true,
      },
    ],
    devices: [
      {
        id: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9b",
        client: "ios",
        label: null,
        createdAt: "2026-10-23T12:00:00.000Z",
        lastSeenAt: "2026-10-23T12:00:00.000Z",
        revokedAt: null,
      },
    ],
  });
  assert.equal("accessToken" in parsed.sessions[0], false);
  assert.equal("refreshToken" in parsed.sessions[0], false);
  assert.equal(JSON.stringify(parsed).includes("TokenHash"), false);
  assert.equal(authCookieNames.access, "ipo_singh_access");
  assert.equal(mobileSecureStoreKeys.refresh, "ipo-singh.refresh-token");
  const token = "a".repeat(43);
  const grant = mobileSessionGrantSchema.parse({ account, accessToken: token, refreshToken: `${token}b`.slice(0, 43) });
  assert.equal(grant.accessToken, token);
  assert.equal(mobileSessionGrantSchema.safeParse({ ...grant, csrfToken: token }).success, false);
  assert.equal(mobileRefreshRequestSchema.safeParse({ refreshToken: token, accessToken: token }).success, false);
});
