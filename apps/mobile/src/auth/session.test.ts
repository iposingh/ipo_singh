import assert from "node:assert/strict";
import test from "node:test";
import { accountSessionResponseSchema, defaultAccountPreferences, mobileAuthClientHeader, mobileSecureStoreKeys } from "@ipo-singh/contracts";
import { createAuthSession } from "./session.ts";
import { createMemorySecretStore } from "./secrets.ts";

const access = "a".repeat(43);
const refresh = "b".repeat(43);
const nextAccess = "c".repeat(43);
const nextRefresh = "d".repeat(43);
const password = "Horse-battery-99";

const account = {
  id: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f",
  email: "phone@example.com",
  displayName: "Phone Reader",
  status: "active",
  role: "member",
  preferences: defaultAccountPreferences,
  createdAt: "2026-10-26T04:00:00.000Z",
  updatedAt: "2026-10-26T04:00:00.000Z",
  statusChangedAt: "2026-10-26T04:00:00.000Z",
  lastAuthenticatedAt: "2026-10-26T04:00:00.000Z",
};

const otherSession = "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9a";

const snapshot = {
  account,
  sessions: [
    {
      id: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9b",
      deviceId: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9c",
      client: "ios",
      createdAt: account.createdAt,
      accessExpiresAt: "2026-10-26T04:15:00.000Z",
      refreshExpiresAt: "2026-11-25T04:00:00.000Z",
      revokedAt: null,
      current: true,
    },
    {
      id: otherSession,
      deviceId: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9d",
      client: "web",
      createdAt: account.createdAt,
      accessExpiresAt: "2026-10-26T04:15:00.000Z",
      refreshExpiresAt: "2026-11-25T04:00:00.000Z",
      revokedAt: null,
      current: false,
    },
  ],
  devices: [],
};

function json(status: number, body: unknown): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function waitFor(ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("The session requests did not start.");
}

test("registration, login, profile, password, revoke, and logout use one bearer session", async () => {
  const store = createMemorySecretStore();
  const asyncStorage: Record<string, string> = {};
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = String(init?.body ?? "");
    assert.equal(headers.get(mobileAuthClientHeader), "ios");
    assert.equal(url.includes("ipoguru"), false);
    if (url.endsWith("/register") && body.includes("short")) {
      return json(400, { code: "validation_error", message: "Request validation failed.", fieldErrors: [{ field: "password", message: "Include a letter and a number." }] });
    }
    if (url.endsWith("/register") || url.endsWith("/login")) {
      assert.equal(body.includes(password), true);
      assert.equal(body.includes("accessToken"), false);
      if (body.includes("installationId")) {
        assert.match(body, /018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f/);
      }
      return json(url.endsWith("/register") ? 201 : 200, { account, accessToken: access, refreshToken: refresh });
    }
    if (headers.get("authorization") !== `Bearer ${access}`) return json(401, { code: "unauthenticated", message: "Sign in to continue." });
    if (url.endsWith("/session")) return json(200, snapshot);
    if (url.endsWith("/profile")) return json(200, { account: { ...account, displayName: "Updated Reader" } });
    if (url.endsWith("/password")) return json(200, { account });
    if (url.endsWith("/sessions/revoke")) return json(200, { ...snapshot, sessions: snapshot.sessions.filter((item) => item.id !== otherSession) });
    if (url.endsWith("/logout")) return json(204, null);
    return json(500, { code: "unavailable", message: "The IPO Singh API is unavailable." });
  };
  const session = createAuthSession({ store, origin: "https://api.example.com", client: "ios", fetchImpl });
  const rejected = await session.register({ email: "phone@example.com", password: "short" });
  assert.equal(rejected.status, "rejected");
  if (rejected.status === "rejected") assert.equal(rejected.message, "Include a letter and a number.");
  assert.deepEqual(store.records(), {});

  const created = await session.register({
    email: "phone@example.com",
    password,
    displayName: "Phone Reader",
    installationId: account.id,
  });
  assert.equal(created.status, "ready");
  assert.equal(JSON.stringify(created).includes(password), false);
  assert.equal(JSON.stringify(created).includes(refresh), false);
  assert.deepEqual(store.records(), { [mobileSecureStoreKeys.access]: access, [mobileSecureStoreKeys.refresh]: refresh });
  assert.deepEqual(asyncStorage, {});

  const renamed = await session.updateDisplayName("Updated Reader");
  assert.equal(renamed.status, "ready");
  const changed = await session.changePassword({ currentPassword: password, newPassword: "Horse-battery-98" });
  assert.equal(changed.status, "ready");
  assert.equal(JSON.stringify(changed).includes("Horse-battery-98"), false);
  const revoked = await session.revokeSession(otherSession);
  assert.equal(revoked.status, "ready");
  if (revoked.status === "ready") assert.equal(revoked.value.sessions.some((item) => item.id === otherSession), false);

  const restarted = createAuthSession({ store, origin: "https://api.example.com", client: "ios", fetchImpl });
  const restored = await restarted.restore();
  assert.equal(restored.status, "ready");
  if (restored.status === "ready") assert.equal(restored.value.account.email, account.email);
  assert.equal(accountSessionResponseSchema.safeParse(restored.status === "ready" ? restored.value : null).success, true);

  const signedOut = await restarted.logout(false);
  assert.equal(signedOut.status, "signed-out");
  if (signedOut.status === "signed-out") assert.equal(signedOut.pendingServer, false);
  assert.deepEqual(store.records(), {});
});

test("an expired access token refreshes once for simultaneous calls", async () => {
  const store = createMemorySecretStore();
  await store.set(mobileSecureStoreKeys.access, access);
  await store.set(mobileSecureStoreKeys.refresh, refresh);
  let refreshCalls = 0;
  let sessionCalls = 0;
  let release = () => undefined as void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const bearer = new Headers(init?.headers).get("authorization");
    if (url.endsWith("/refresh")) {
      refreshCalls += 1;
      await gate;
      return json(200, { account, accessToken: nextAccess, refreshToken: nextRefresh });
    }
    sessionCalls += 1;
    if (bearer === `Bearer ${access}`) return json(401, { code: "unauthenticated", message: "Sign in to continue." });
    if (bearer === `Bearer ${nextAccess}`) return json(200, snapshot);
    return json(401, { code: "unauthenticated", message: "Sign in to continue." });
  };
  const session = createAuthSession({ store, origin: "https://api.example.com", client: "android", fetchImpl });
  const first = session.authorized({ path: "/api/v1/auth/session", schema: accountSessionResponseSchema });
  const second = session.authorized({ path: "/api/v1/auth/session", schema: accountSessionResponseSchema });
  await waitFor(() => sessionCalls >= 2 && refreshCalls === 1);
  release();
  const settled = await Promise.all([first, second]);
  assert.equal(refreshCalls, 1);
  assert.equal(settled.every((item) => item.status === "ready"), true);
  assert.equal(store.records()[mobileSecureStoreKeys.refresh], nextRefresh);
  assert.equal(store.records()[mobileSecureStoreKeys.access], nextAccess);
});

test("a revoked refresh signs out, a rate limit keeps the session, and offline logout clears this device", async () => {
  const revokedStore = createMemorySecretStore();
  await revokedStore.set(mobileSecureStoreKeys.access, access);
  await revokedStore.set(mobileSecureStoreKeys.refresh, refresh);
  const revoked = createAuthSession({
    store: revokedStore,
    origin: "https://api.example.com",
    client: "ios",
    fetchImpl: async (input) => {
      if (String(input).endsWith("/refresh")) return json(401, { code: "unauthenticated", message: "Sign in to continue." });
      return json(401, { code: "unauthenticated", message: "Sign in to continue." });
    },
  });
  const signedOut = await revoked.restore();
  assert.equal(signedOut.status, "signed-out");
  assert.deepEqual(revokedStore.records(), {});
  assert.equal(JSON.stringify(signedOut).includes(refresh), false);

  const limitedStore = createMemorySecretStore();
  await limitedStore.set(mobileSecureStoreKeys.access, access);
  await limitedStore.set(mobileSecureStoreKeys.refresh, refresh);
  let limitedCalls = 0;
  const limited = createAuthSession({
    store: limitedStore,
    origin: "https://api.example.com",
    client: "ios",
    fetchImpl: async (input) => {
      if (String(input).endsWith("/refresh")) {
        limitedCalls += 1;
        return json(429, { code: "rate_limited", message: "Too many attempts. Try again shortly." });
      }
      return json(401, { code: "unauthenticated", message: "Sign in to continue." });
    },
  });
  const paced = await limited.restore();
  assert.equal(paced.status, "limited");
  assert.equal(limitedCalls, 1);
  assert.equal(limitedStore.records()[mobileSecureStoreKeys.refresh], refresh);

  const offlineStore = createMemorySecretStore();
  await offlineStore.set(mobileSecureStoreKeys.access, access);
  await offlineStore.set(mobileSecureStoreKeys.refresh, refresh);
  let offlineCalls = 0;
  const offline = createAuthSession({
    store: offlineStore,
    origin: "https://api.example.com",
    client: "ios",
    offline: true,
    fetchImpl: async () => {
      offlineCalls += 1;
      return json(500, { code: "unavailable", message: "The IPO Singh API is unavailable." });
    },
  });
  const held = await offline.restore();
  assert.equal(held.status, "offline");
  assert.equal(offlineCalls, 0);
  const cleared = await offline.logout(false);
  assert.equal(cleared.status, "signed-out");
  if (cleared.status === "signed-out") assert.equal(cleared.pendingServer, true);
  assert.deepEqual(offlineStore.records(), {});
  assert.equal(offlineCalls, 0);
});
