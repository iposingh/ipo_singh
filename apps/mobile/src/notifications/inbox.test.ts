import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultAccountPreferences,
  mobileAuthClientHeader,
  mobileSecureStoreKeys,
  type NotificationItem,
} from "@ipo-singh/contracts";
import { createAuthSession } from "../auth/session.ts";
import { createMemorySecretStore } from "../auth/secrets.ts";
import { createNotificationInbox, type AccountCaller } from "./controller.ts";
import {
  appendNotifications,
  notificationCollectionPath,
  notificationIssueRoute,
  notificationPagePath,
  notificationPreferencesPath,
  notificationReadAllPath,
  notificationReadPath,
  notificationStatusMessage,
  notificationUnreadPath,
} from "./inbox.ts";

const origin = "https://api.example.com";
const access = "a".repeat(43);
const refresh = "b".repeat(43);
const nextAccess = "c".repeat(43);
const nextRefresh = "d".repeat(43);
const now = new Date("2026-10-26T10:00:00.000Z");
const notificationId = "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f";
const secondId = "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9a";

const account = {
  id: notificationId,
  email: "phone@example.com",
  displayName: "Phone Reader",
  status: "active" as const,
  role: "member" as const,
  preferences: defaultAccountPreferences,
  createdAt: "2026-10-26T04:00:00.000Z",
  updatedAt: "2026-10-26T04:00:00.000Z",
  statusChangedAt: "2026-10-26T04:00:00.000Z",
  lastAuthenticatedAt: "2026-10-26T04:00:00.000Z",
};

function notice(patch: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: notificationId,
    type: "open",
    ipoId: "fixture-mills",
    title: "Fixture Mills is open",
    body: "The stored opening date is today.",
    createdAt: "2026-10-26T04:30:00.000Z",
    readAt: null,
    expiresAt: "2026-11-25T04:30:00.000Z",
    delivery: { inApp: "delivered", push: "not-sent" },
    ...patch,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("pages stay unique, read state changes the unread count, and an IPO notification opens that issue", async () => {
  const first = notice();
  const second = notice({ id: secondId, type: "announcement", ipoId: null, title: "IPO Singh announcement" });
  const calls: string[] = [];
  let failRead = false;
  const caller = (async (input: { path: string; method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }) => {
    const method = input.method ?? "GET";
    calls.push(`${method} ${input.path}`);
    assert.equal(input.path.includes("ipoguru"), false);
    assert.equal(method === "POST" && input.path === notificationCollectionPath, false);
    if (input.path === notificationUnreadPath) return { status: "ready", value: { unreadCount: 2 } };
    if (input.path === notificationPagePath(null)) {
      return { status: "ready", value: { items: [first, first], page: { limit: 20, nextCursor: "page-2", totalCount: 2 } } };
    }
    if (input.path === notificationPagePath("page-2")) {
      return { status: "ready", value: { items: [first, second], page: { limit: 20, nextCursor: null, totalCount: 2 } } };
    }
    if (input.path === notificationReadPath(notificationId)) {
      return { status: "ready", value: { ...first, readAt: now.toISOString() } };
    }
    if (input.path === notificationReadPath(secondId)) {
      if (failRead) return { status: "rejected", message: "That notification could not be marked read." };
      return { status: "ready", value: { ...second, readAt: now.toISOString() } };
    }
    if (input.path === notificationReadAllPath) return { status: "ready", value: { marked: 1 } };
    return { status: "unavailable", message: "Unexpected notification request." };
  }) as AccountCaller;

  const inbox = createNotificationInbox(caller);
  await inbox.loadUnread();
  await inbox.loadFirst();
  assert.equal(inbox.snapshot().items.length, 1);
  assert.equal(inbox.snapshot().unreadCount, 2);
  await inbox.loadMore();
  assert.deepEqual(inbox.snapshot().items.map((item) => item.id), [notificationId, secondId]);
  assert.equal(inbox.snapshot().nextCursor, null);
  assert.equal(appendNotifications([first], [first, second]).length, 2);

  const read = await inbox.markRead(notificationId, now);
  assert.equal(read.status, "ready");
  assert.equal(inbox.snapshot().items[0]?.readAt, now.toISOString());
  assert.equal(inbox.snapshot().unreadCount, 1);
  assert.equal(inbox.snapshot().items[1]?.readAt, null);

  failRead = true;
  const failed = await inbox.markRead(secondId, now);
  assert.equal(failed.status, "rejected");
  assert.equal(inbox.snapshot().items[1]?.readAt, null);
  assert.equal(inbox.snapshot().unreadCount, 1);

  const marked = await inbox.markAll(now);
  assert.equal(marked.status, "ready");
  assert.equal(inbox.snapshot().unreadCount, 0);
  assert.equal(inbox.snapshot().items.every((item) => item.readAt !== null), true);
  assert.deepEqual(calls.filter((call) => call.startsWith("POST ")), [
    `POST ${notificationReadPath(notificationId)}`,
    `POST ${notificationReadPath(secondId)}`,
    `POST ${notificationReadAllPath}`,
  ]);
  assert.equal(notificationIssueRoute(first.ipoId)?.params.slug, "fixture-mills");
  assert.equal(notificationIssueRoute(second.ipoId), null);
  assert.equal(notificationIssueRoute("Bad Slug"), null);
  assert.equal(notificationStatusMessage("signed-out", "load"), "Sign in to read notifications.");
});

test("a failed mark-all restores the previous unread list and alert settings reject a push token", async () => {
  const stored = notice();
  let mode: "ready" | "offline" | "rejected" = "ready";
  const calls: string[] = [];
  const caller = (async (input: { path: string; method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }) => {
    calls.push(`${input.method ?? "GET"} ${input.path}`);
    if (mode === "offline") return { status: "offline" };
    if (input.path === notificationPreferencesPath) {
      assert.equal(JSON.stringify(input.body).includes("pushToken"), false);
      return {
        status: "ready",
        value: { account: { ...account, preferences: { ...defaultAccountPreferences, alertsEnabled: true, notificationCategories: { ...defaultAccountPreferences.notificationCategories, gmp: true } } } },
      };
    }
    if (mode === "rejected") return { status: "rejected", message: "Notifications could not be marked read." };
    if (input.path === notificationPagePath(null)) {
      return { status: "ready", value: { items: [stored], page: { limit: 20, nextCursor: null, totalCount: 1 } } };
    }
    if (input.path === notificationUnreadPath) return { status: "ready", value: { unreadCount: 1 } };
    if (input.path === notificationReadAllPath) return { status: "ready", value: { marked: 1 } };
    return { status: "unavailable", message: "Unexpected notification request." };
  }) as AccountCaller;
  const inbox = createNotificationInbox(caller);
  mode = "offline";
  const offline = await inbox.loadFirst();
  assert.equal(offline.status, "offline");
  assert.equal(inbox.snapshot().items.length, 0);
  mode = "ready";
  await inbox.loadUnread();
  await inbox.loadFirst();
  mode = "rejected";
  const failed = await inbox.markAll(now);
  assert.equal(failed.status, "rejected");
  assert.equal(inbox.snapshot().unreadCount, 1);
  assert.equal(inbox.snapshot().items[0]?.readAt, null);
  mode = "ready";
  const saved = await inbox.saveAlerts({ alertsEnabled: true, notificationCategories: { gmp: true } });
  assert.equal(saved.status, "ready");
  if (saved.status === "ready") assert.equal(saved.value.preferences.notificationCategories.gmp, true);
  const rejected = await inbox.saveAlerts({ pushToken: "device-token", alertsEnabled: true });
  assert.equal(rejected.status, "rejected");
  assert.equal(calls.filter((call) => call.startsWith("PATCH ")).length, 1);
  assert.equal(calls.some((call) => call.includes(notificationPreferencesPath)), true);
});

test("an expired access secret refreshes once and a revoked refresh clears the inbox", async () => {
  const store = createMemorySecretStore();
  await store.set(mobileSecureStoreKeys.access, access);
  await store.set(mobileSecureStoreKeys.refresh, refresh);
  let unreadCalls = 0;
  let refreshCalls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    assert.equal(url.includes("ipoguru"), false);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get(mobileAuthClientHeader), "ios");
    if (url.endsWith("/api/v1/auth/refresh")) {
      refreshCalls += 1;
      return json(200, { account, accessToken: nextAccess, refreshToken: nextRefresh });
    }
    unreadCalls += 1;
    if (headers.get("authorization") === `Bearer ${access}`) return json(401, { code: "unauthenticated", message: "Sign in required." });
    assert.equal(headers.get("authorization"), `Bearer ${nextAccess}`);
    if (url.endsWith(notificationUnreadPath)) return json(200, { unreadCount: 2 });
    return json(200, { items: [notice()], page: { limit: 20, nextCursor: null, totalCount: 1 } });
  };
  const session = createAuthSession({ store, origin, client: "ios", fetchImpl });
  const inbox = createNotificationInbox((input) => session.authorized(input));
  const counted = await inbox.loadUnread();
  assert.equal(counted.status, "ready");
  assert.equal(refreshCalls, 1);
  assert.equal(unreadCalls, 2);
  assert.equal(inbox.snapshot().unreadCount, 2);
  const listed = await inbox.loadFirst();
  assert.equal(listed.status, "ready");
  assert.equal(inbox.snapshot().items[0]?.ipoId, "fixture-mills");
  assert.equal(inbox.snapshot().items[0]?.delivery.push, "not-sent");

  const revoked = createMemorySecretStore();
  await revoked.set(mobileSecureStoreKeys.access, access);
  await revoked.set(mobileSecureStoreKeys.refresh, refresh);
  const revokedFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/v1/auth/refresh")) return json(401, { code: "unauthenticated", message: "Sign in required." });
    return json(401, { code: "unauthenticated", message: "Sign in required." });
  };
  const revokedSession = createAuthSession({ store: revoked, origin, client: "android", fetchImpl: revokedFetch });
  const signedOut = createNotificationInbox((input) => revokedSession.authorized(input));
  const result = await signedOut.loadFirst();
  assert.equal(result.status, "signed-out");
  assert.deepEqual(signedOut.snapshot(), { items: [], nextCursor: null, unreadCount: 0 });
  assert.deepEqual(revoked.records(), {});
});
