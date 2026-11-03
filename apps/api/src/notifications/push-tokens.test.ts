import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryPushTokenStore } from "./push-memory-store.ts";
import { registerAnonymousPushToken, registerPushToken } from "./push-tokens.ts";

const token = "ExponentPushToken[security-boundary-token]";

test("anonymous registration cannot take over an active signed-in push token", async () => {
  const store = createMemoryPushTokenStore();
  const now = new Date("2026-11-03T10:00:00.000Z");
  await registerPushToken(store, {
    userId: "user-1",
    deviceId: "device-1",
    platform: "ios",
    token,
    ownerKind: "user",
    now,
  });
  // signed-in tokens keep board flags unused (account preferences decide)
  await registerAnonymousPushToken(store, {
    installationId: "install-attacker",
    platform: "ios",
    token,
    now: new Date(now.getTime() + 1_000),
  });
  const kept = await store.findByToken(token);
  assert.equal(kept?.userId, "user-1");
  assert.equal(kept?.ownerKind, "user");
});

test("signed-in registration may claim a previously anonymous token", async () => {
  const store = createMemoryPushTokenStore();
  const now = new Date("2026-11-03T10:00:00.000Z");
  await registerAnonymousPushToken(store, {
    installationId: "install-1",
    platform: "android",
    token,
    now,
  });
  await registerPushToken(store, {
    userId: "user-2",
    deviceId: "device-2",
    platform: "android",
    token,
    ownerKind: "user",
    now: new Date(now.getTime() + 1_000),
  });
  const claimed = await store.findByToken(token);
  assert.equal(claimed?.userId, "user-2");
  assert.equal(claimed?.ownerKind, "user");
});
