import { defaultAccountPreferences, type AccountPreferences } from "@ipo-singh/contracts";
import assert from "node:assert/strict";
import express from "express";
import { after, describe, it } from "node:test";
import { createMemoryAccountStore } from "../accounts/memory-store.ts";
import type { DeviceRecord, UserRecord } from "../accounts/records.ts";
import { issueSession } from "../accounts/session-service.ts";
import { createAccountId } from "../accounts/tokens.ts";
import { readAlertPolicy } from "../config/alert-policy.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import { createSyncLock } from "../jobs/lock.ts";
import { errorHandler } from "../middleware/error-handler.ts";
import { createAuthMiddleware } from "../accounts/middleware.ts";
import { createAuthRouter } from "../accounts/routes.ts";
import { createFastPasswordHasher } from "../accounts/passwords.ts";
import { createLoginAttemptLimiter } from "../accounts/attempts.ts";
import { createLogger } from "../shared/logger.ts";
import { createMemoryNotificationStore } from "./memory-store.ts";
import { createMemoryPushTokenStore } from "./push-memory-store.ts";
import { runPushDelivery, runPushReceiptCheck } from "./push-delivery.ts";
import { registerPushToken } from "./push-tokens.ts";
import { createNotificationRouter } from "./routes.ts";
import type { NotificationRecord } from "./records.ts";
import { createUnconfiguredCache } from "../cache/connection.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";

const now = new Date("2026-10-23T10:30:00.000Z");
const token = "ExponentPushToken[abcdefghijklmnop]";
const quiet = createLogger({ level: "error", service: "test", sink: () => undefined });

function preferences(patch: { mobilePush?: AccountPreferences["mobilePush"]; categories?: Partial<AccountPreferences["notificationCategories"]> } = {}): AccountPreferences {
  return {
    ...defaultAccountPreferences,
    alertsEnabled: true,
    mainboardGlobalAlerts: true,
    smeWatchlistAlerts: true,
    mobilePush: patch.mobilePush ?? "when-available",
    notificationCategories: {
      ...defaultAccountPreferences.notificationCategories,
      closing: true,
      ...patch.categories,
    },
  };
}

function user(id: string, prefs = preferences()): UserRecord {
  return {
    id,
    email: `${id.slice(0, 8)}@example.com`,
    displayName: null,
    status: "active",
    role: "member",
    preferences: prefs,
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    lastAuthenticatedAt: now,
    suspendedAt: null,
    closedAt: null,
    passwordHash: "hash",
  };
}

function device(userId: string, client: DeviceRecord["client"] = "ios"): DeviceRecord {
  return {
    id: createAccountId(),
    userId,
    client,
    label: client,
    installationId: null,
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
}

function notice(userId: string, dedupeKey: string, createdAt = now): NotificationRecord {
  return {
    id: createAccountId(),
    userId,
    type: "closing",
    ipoId: "fixture-mills",
    title: "Fixture Mills closes in about 24 hours",
    body: "Fixture Mills has a stored close date of 24 Oct 2026.",
    createdAt,
    readAt: null,
    expiresAt: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
    dedupeKey,
    delivery: { inApp: "delivered", push: "not-sent" },
    source: { name: "Fixture", observedAt: createdAt },
  };
}

function harness() {
  const accounts = createMemoryAccountStore();
  const notifications = createMemoryNotificationStore();
  const pushTokens = createMemoryPushTokenStore();
  const logs: unknown[] = [];
  const database: DatabaseHandle = {
    accounts,
    notifications,
    pushTokens,
    async check() {
      return "ok";
    },
    async close() {
      return undefined;
    },
  };
  return {
    accounts,
    notifications,
    pushTokens,
    logs,
    async deliver(fetchImpl: typeof fetch, when = now, policy = readAlertPolicy({ PUSH_DELIVERY_ENABLED: "true" })) {
      return runPushDelivery({
        database,
        locks: createSyncLock(null, { allowProcessLocal: true }),
        policy,
        logger: createLogger({ level: "info", service: "test", sink: (entry) => logs.push(entry) }),
        accessToken: "expo-access-secret",
        now: when,
        fetchImpl,
      });
    },
    async receipts(fetchImpl: typeof fetch, when = now, policy = readAlertPolicy({ PUSH_DELIVERY_ENABLED: "true" })) {
      return runPushReceiptCheck({
        database,
        locks: createSyncLock(null, { allowProcessLocal: true }),
        policy,
        logger: createLogger({ level: "info", service: "test", sink: (entry) => logs.push(entry) }),
        accessToken: "expo-access-secret",
        now: when,
        fetchImpl,
      });
    },
  };
}

function okFetch(calls: unknown[]): typeof fetch {
  return async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as unknown[];
    calls.push(body);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer expo-access-secret");
    return new Response(JSON.stringify({ data: body.map(() => ({ status: "ok", id: "ticket" })) }), { status: 200 });
  };
}

describe("push delivery", () => {
  it("sends one Expo reminder and does not send it again", async () => {
    const setup = harness();
    const owner = user(createAccountId());
    const phone = device(owner.id);
    await setup.accounts.insertUser(owner);
    await setup.accounts.insertDevice(phone);
    await registerPushToken(setup.pushTokens, { userId: owner.id, deviceId: phone.id, platform: "ios", token, now });
    await setup.notifications.insertIfNew(notice(owner.id, "closing:24h:fixture-mills:2026-10-24"));
    const calls: unknown[] = [];
    const first = await setup.deliver(okFetch(calls));
    assert.equal(first.sent, 1);
    const payload = JSON.stringify(calls[0]);
    assert.equal(payload.includes("email"), false);
    assert.equal(payload.includes("sms"), false);
    assert.equal(payload.includes(token), true);
    assert.equal(payload.includes("fixture-mills"), true);
    assert.equal(JSON.stringify(setup.logs).includes(token), false);
    assert.equal(JSON.stringify(setup.logs).includes("expo-access-secret"), false);
    const second = await setup.deliver(okFetch(calls));
    assert.equal(second.sent, 0);
    assert.equal(calls.length, 1);
    const stored = await setup.notifications.listForUser(owner.id, now);
    assert.equal(stored[0]?.delivery.push, "sent");
  });

  it("skips a push when the preference, category, or token is off, and when the reminder is late", async () => {
    const setup = harness();
    const optedOut = user(createAccountId(), preferences({ mobilePush: "off" }));
    const categoryOff = user(createAccountId(), preferences({ categories: { closing: false } }));
    const noToken = user(createAccountId());
    const lateUser = user(createAccountId());
    for (const account of [optedOut, categoryOff, noToken, lateUser]) await setup.accounts.insertUser(account);
    const phone = device(lateUser.id);
    await setup.accounts.insertDevice(phone);
    await registerPushToken(setup.pushTokens, { userId: lateUser.id, deviceId: phone.id, platform: "ios", token, now });
    await setup.notifications.insertIfNew(notice(optedOut.id, "closing:24h:fixture-mills:opt-out"));
    await setup.notifications.insertIfNew(notice(categoryOff.id, "closing:24h:fixture-mills:category"));
    await setup.notifications.insertIfNew(notice(noToken.id, "closing:24h:fixture-mills:no-token"));
    await setup.notifications.insertIfNew(notice(lateUser.id, "closing:1h:fixture-mills:late", new Date(now.getTime() - 2 * 60 * 60 * 1000)));
    const calls: unknown[] = [];
    const result = await setup.deliver(okFetch(calls));
    assert.equal(result.skipped, 4);
    assert.equal(calls.length, 0);
    assert.equal((await setup.notifications.listForUser(lateUser.id, now))[0]?.delivery.push, "skipped");
  });

  it("retries a provider failure and then stops", async () => {
    const setup = harness();
    const owner = user(createAccountId());
    const phone = device(owner.id);
    await setup.accounts.insertUser(owner);
    await setup.accounts.insertDevice(phone);
    await registerPushToken(setup.pushTokens, { userId: owner.id, deviceId: phone.id, platform: "ios", token, now });
    await setup.notifications.insertIfNew(notice(owner.id, "closing:24h:fixture-mills:retry"));
    const failed: typeof fetch = async () => new Response("no", { status: 503 });
    const policy = { ...readAlertPolicy({ PUSH_DELIVERY_ENABLED: "true" }), maxAttempts: 2 };
    const first = await setup.deliver(failed, now, policy);
    assert.equal(first.failed, 0);
    assert.equal((await setup.notifications.listForUser(owner.id, now))[0]?.delivery.push, "not-sent");
    const early = await setup.deliver(failed, new Date(now.getTime() + 30_000), policy);
    assert.equal(early.examined, 1);
    assert.equal(early.failed, 0);
    const second = await setup.deliver(failed, new Date(now.getTime() + 2 * 60_000), policy);
    assert.equal(second.failed, 1);
    assert.equal((await setup.notifications.listForUser(owner.id, now))[0]?.delivery.push, "failed");
  });

  it("retires a token Expo no longer recognizes", async () => {
    const setup = harness();
    const owner = user(createAccountId());
    const phone = device(owner.id);
    await setup.accounts.insertUser(owner);
    await setup.accounts.insertDevice(phone);
    await registerPushToken(setup.pushTokens, { userId: owner.id, deviceId: phone.id, platform: "ios", token, now });
    await setup.notifications.insertIfNew(notice(owner.id, "closing:24h:fixture-mills:invalid"));
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: [{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }] }), { status: 200 });
    };
    const result = await setup.deliver(fetchImpl);
    assert.equal(result.invalidTokens, 1);
    assert.equal(result.failed, 1);
    assert.equal((await setup.pushTokens.listActive(owner.id)).length, 0);
    await setup.deliver(fetchImpl);
    assert.equal(calls, 1);
  });

  it("caps one user at eight pushes in a pass", async () => {
    const setup = harness();
    const owner = user(createAccountId());
    const phone = device(owner.id);
    await setup.accounts.insertUser(owner);
    await setup.accounts.insertDevice(phone);
    await registerPushToken(setup.pushTokens, { userId: owner.id, deviceId: phone.id, platform: "ios", token, now });
    for (let index = 0; index < 10; index += 1) {
      await setup.notifications.insertIfNew(notice(owner.id, `closing:24h:fixture-mills:${index}`));
    }
    const calls: unknown[][] = [];
    await setup.deliver(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as unknown[];
      calls.push(body);
      return new Response(JSON.stringify({ data: body.map(() => ({ status: "ok", id: "ticket" })) }), { status: 200 });
    });
    assert.equal(calls[0]?.length, 8);
    const rows = await setup.notifications.listForUser(owner.id, now);
    assert.equal(rows.filter((item) => item.delivery.push === "sent").length, 8);
    assert.equal(rows.filter((item) => item.delivery.push === "not-sent").length, 2);
  });

  it("records push metrics for ops when delivery runs or stays disabled", async () => {
    const { pushMetricsSnapshot, resetPushMetrics } = await import("./metrics.ts");
    resetPushMetrics();
    const setup = harness();
    const disabled = await setup.deliver(async () => new Response("{}", { status: 500 }), now, readAlertPolicy({}));
    assert.equal(disabled.status, "disabled");
    assert.equal(pushMetricsSnapshot().lastDeliveryStatus, "disabled");

    const owner = user(createAccountId());
    const phone = device(owner.id);
    await setup.accounts.insertUser(owner);
    await setup.accounts.insertDevice(phone);
    await registerPushToken(setup.pushTokens, { userId: owner.id, deviceId: phone.id, platform: "ios", token, now });
    await setup.notifications.insertIfNew(notice(owner.id, "closing:metrics"));
    const sent = await setup.deliver(
      async () => new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket-metrics" }] }), { status: 200 }),
    );
    assert.equal(sent.status, "ran");
    assert.equal(sent.sent, 1);
    assert.equal(pushMetricsSnapshot().sent >= 1, true);
    assert.equal(pushMetricsSnapshot().lastDeliveryStatus, "ran");
    resetPushMetrics();
  });

  it("stays disabled until PUSH_DELIVERY_ENABLED is true", async () => {
    const setup = harness();
    const owner = user(createAccountId());
    const phone = device(owner.id);
    await setup.accounts.insertUser(owner);
    await setup.accounts.insertDevice(phone);
    await registerPushToken(setup.pushTokens, { userId: owner.id, deviceId: phone.id, platform: "ios", token, now });
    await setup.notifications.insertIfNew(notice(owner.id, "closing:24h:fixture-mills:disabled"));
    const calls: unknown[] = [];
    const disabled = await setup.deliver(okFetch(calls), now, readAlertPolicy({}));
    assert.equal(disabled.status, "disabled");
    assert.equal(calls.length, 0);
    assert.equal(readAlertPolicy({}).pushDeliveryEnabled, false);
    assert.equal(readAlertPolicy({ PUSH_DELIVERY_ENABLED: "true" }).pushDeliveryEnabled, true);
  });

  it("checks Expo receipts and invalidates DeviceNotRegistered tokens", async () => {
    const setup = harness();
    const owner = user(createAccountId());
    const phone = device(owner.id);
    await setup.accounts.insertUser(owner);
    await setup.accounts.insertDevice(phone);
    await registerPushToken(setup.pushTokens, { userId: owner.id, deviceId: phone.id, platform: "ios", token, now });
    await setup.notifications.insertIfNew(notice(owner.id, "closing:24h:fixture-mills:receipt"));
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      urls.push(String(url));
      if (String(url).includes("getReceipts")) {
        const body = JSON.parse(String(init?.body)) as { ids: string[] };
        assert.deepEqual(body.ids, ["ticket-abc"]);
        return new Response(
          JSON.stringify({
            data: {
              "ticket-abc": { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket-abc" }] }), { status: 200 });
    };
    const sent = await setup.deliver(fetchImpl);
    assert.equal(sent.sent, 1);
    const receipts = await setup.receipts(fetchImpl);
    assert.equal(receipts.status, "ran");
    assert.equal(receipts.invalidTokens, 1);
    assert.equal((await setup.pushTokens.listActive(owner.id)).length, 0);
    assert.equal(urls.some((url) => url.includes("getReceipts")), true);
  });

  it("keeps at most five active tokens and moves a token to the latest user", async () => {
    const setup = harness();
    const firstUser = user(createAccountId());
    const secondUser = user(createAccountId());
    const phone = device(firstUser.id);
    const other = device(secondUser.id);
    await setup.accounts.insertUser(firstUser);
    await setup.accounts.insertUser(secondUser);
    await setup.accounts.insertDevice(phone);
    await setup.accounts.insertDevice(other);
    for (let index = 0; index < 6; index += 1) {
      await registerPushToken(setup.pushTokens, {
        userId: firstUser.id,
        deviceId: phone.id,
        platform: "ios",
        token: `ExponentPushToken[token${index}abcdefghij]`,
        now: new Date(now.getTime() + index * 1000),
      });
    }
    assert.equal((await setup.pushTokens.listActive(firstUser.id)).length, 5);
    assert.equal((await setup.pushTokens.findByToken("ExponentPushToken[token0abcdefghij]"))?.status, "revoked");
    await registerPushToken(setup.pushTokens, { userId: secondUser.id, deviceId: other.id, platform: "android", token, now });
    await registerPushToken(setup.pushTokens, { userId: firstUser.id, deviceId: phone.id, platform: "ios", token, now: new Date(now.getTime() + 1000) });
    assert.equal((await setup.pushTokens.findByToken(token))?.userId, firstUser.id);
    assert.equal((await setup.pushTokens.listActive(secondUser.id)).some((item) => item.token === token), false);
  });
});

describe("push token routes", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];

  after(async () => {
    await Promise.all(servers.map((server) => server.close()));
  });

  it("registers a phone token, hides it from the response, and revokes it on logout", async () => {
    const accounts = createMemoryAccountStore();
    const pushTokens = createMemoryPushTokenStore();
    const owner = user(createAccountId());
    const phone = device(owner.id);
    const other = device(owner.id);
    await accounts.insertUser(owner);
    await accounts.insertDevice(phone);
    await accounts.insertDevice(other);
    const current = await issueSession(accounts, { userId: owner.id, deviceId: phone.id });
    const second = await issueSession(accounts, { userId: owner.id, deviceId: other.id });
    await registerPushToken(pushTokens, { userId: owner.id, deviceId: other.id, platform: "ios", token: "ExponentPushToken[otherdeviceabcdef]", now });
    const logs: unknown[] = [];
    const logger = createLogger({ level: "info", service: "test", sink: (entry) => logs.push(entry) });
    const database: DatabaseHandle = {
      accounts,
      notifications: createMemoryNotificationStore(),
      pushTokens,
      async check() {
        return "ok";
      },
      async close() {
        return undefined;
      },
    };
    const app = express();
    app.use(express.json());
    app.use(createAuthMiddleware(() => accounts));
    app.use("/api/v1/auth", createAuthRouter({
      readStore: () => accounts,
      hasher: createFastPasswordHasher(),
      attempts: createLoginAttemptLimiter(),
      logger,
      secureCookies: false,
      revokePushTokens: (input) => pushTokens.revokeActive(input).then(() => undefined),
    }));
    app.use("/api/v1/notifications", createNotificationRouter({
      database,
      cache: createUnconfiguredCache(defaultCachePolicy(), defaultQuotaPolicy(), logger),
      logger,
    }));
    app.use(errorHandler(logger));
    const server = await listen(app);
    servers.push(server);

    const missing = await fetch(`${server.url}/api/v1/notifications/push-tokens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, platform: "ios" }),
    });
    assert.equal(missing.status, 401);

    const registered = await fetch(`${server.url}/api/v1/notifications/push-tokens`, {
      method: "POST",
      headers: { authorization: `Bearer ${current.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ token, platform: "ios", email: "person@example.com" }),
    });
    assert.equal(registered.status, 400);

    const saved = await fetch(`${server.url}/api/v1/notifications/push-tokens`, {
      method: "POST",
      headers: { authorization: `Bearer ${current.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ token, platform: "ios" }),
    });
    const savedText = await saved.text();
    assert.equal(saved.status, 200);
    assert.equal(savedText.includes(token), false);
    assert.equal((await pushTokens.findByToken(token))?.deviceId, phone.id);
    assert.equal(JSON.stringify(logs).includes(token), false);

    const logout = await fetch(`${server.url}/api/v1/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${current.accessToken}` },
    });
    assert.equal(logout.status, 204);
    assert.equal((await pushTokens.findByToken(token))?.status, "revoked");
    assert.equal((await pushTokens.findByToken("ExponentPushToken[otherdeviceabcdef]"))?.status, "active");

    const ended = await fetch(`${server.url}/api/v1/auth/logout-all`, {
      method: "POST",
      headers: { authorization: `Bearer ${second.accessToken}` },
    });
    assert.equal(ended.status, 204);
    assert.equal((await pushTokens.findByToken("ExponentPushToken[otherdeviceabcdef]"))?.status, "revoked");
  });

  it("rejects a website session and revokes only the signed-in phone token", async () => {
    const accounts = createMemoryAccountStore();
    const pushTokens = createMemoryPushTokenStore();
    const owner = user(createAccountId());
    const browser = device(owner.id, "web");
    const phone = device(owner.id);
    await accounts.insertUser(owner);
    await accounts.insertDevice(browser);
    await accounts.insertDevice(phone);
    const web = await issueSession(accounts, { userId: owner.id, deviceId: browser.id });
    const mobile = await issueSession(accounts, { userId: owner.id, deviceId: phone.id });
    await registerPushToken(pushTokens, { userId: owner.id, deviceId: phone.id, platform: "ios", token, now });
    const logger = quiet;
    const app = express();
    app.use(express.json());
    app.use(createAuthMiddleware(() => accounts));
    app.use("/api/v1/notifications", createNotificationRouter({
      database: {
        accounts,
        notifications: createMemoryNotificationStore(),
        pushTokens,
        async check() {
          return "ok";
        },
        async close() {
          return undefined;
        },
      },
      cache: createUnconfiguredCache(defaultCachePolicy(), defaultQuotaPolicy(), logger),
      logger,
    }));
    app.use(errorHandler(logger));
    const server = await listen(app);
    servers.push(server);
    const rejected = await fetch(`${server.url}/api/v1/notifications/push-tokens`, {
      method: "POST",
      headers: { authorization: `Bearer ${web.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ token: "ExponentPushToken[websiteclientabcd]", platform: "ios" }),
    });
    assert.equal(rejected.status, 400);
    const removed = await fetch(`${server.url}/api/v1/notifications/push-tokens`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${mobile.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal(removed.status, 204);
    assert.equal((await pushTokens.findByToken(token))?.status, "revoked");
  });
});

function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
