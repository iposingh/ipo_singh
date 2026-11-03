import { publicAccountSchema } from "@ipo-singh/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryAccountStore } from "./memory-store.ts";
import { AccountStateError, activateUser, closeUser, createPendingUser, issueSession, registerDevice, resolveAccess, revokeSession, rotateSession, suspendUser, toPublicAccount } from "./session-service.ts";
import { hashToken } from "./tokens.ts";

async function activeSession() {
  const store = createMemoryAccountStore();
  const user = await activateUser(store, (await createPendingUser(store, { email: "Person@Example.com", displayName: "A Reader" })).id);
  const device = await registerDevice(store, { userId: user.id, client: "web", label: "Browser" });
  const issued = await issueSession(store, { userId: user.id, deviceId: device.id });
  return { store, issued };
}

test("sessions store hashes, rotate refresh tokens, and revoke reuse", async () => {
  const { store, issued } = await activeSession();
  assert.equal(issued.user.email, "person@example.com");
  assert.equal(issued.session.accessTokenHash, hashToken(issued.accessToken));
  assert.notEqual(issued.session.accessTokenHash, issued.accessToken);
  assert.equal(publicAccountSchema.parse(toPublicAccount(issued.user)).role, "member");
  assert.equal(JSON.stringify(toPublicAccount(issued.user)).includes(issued.accessToken), false);

  const first = await resolveAccess(store, issued.accessToken);
  assert.equal(first.status, "user");

  const rotated = await rotateSession(store, issued.refreshToken);
  assert.notEqual(rotated.refreshToken, issued.refreshToken);
  assert.equal((await resolveAccess(store, issued.accessToken)).status, "invalid");
  assert.equal((await resolveAccess(store, rotated.accessToken)).status, "user");

  await assert.rejects(rotateSession(store, issued.refreshToken), (error: unknown) => {
    assert.ok(error instanceof AccountStateError);
    assert.equal(error.reason, "reuse");
    return true;
  });
  assert.equal((await resolveAccess(store, rotated.accessToken)).status, "invalid");
});

test("a pending account cannot receive a session", async () => {
  const store = createMemoryAccountStore();
  const pending = await createPendingUser(store, { email: "pending@example.com" });
  const device = await registerDevice(store, { userId: pending.id, client: "ios" });
  await assert.rejects(issueSession(store, { userId: pending.id, deviceId: device.id }), (error: unknown) => {
    assert.ok(error instanceof AccountStateError);
    assert.equal(error.reason, "invalid");
    return true;
  });
  await assert.rejects(createPendingUser(store, { email: "not-an-email" }), (error: unknown) => {
    assert.ok(error instanceof AccountStateError);
    assert.equal(error.reason, "invalid");
    return true;
  });
});

test("suspending and closing revoke sessions and keep the email", async () => {
  const store = createMemoryAccountStore();
  const user = await activateUser(store, (await createPendingUser(store, { email: "Person@Example.com" })).id);
  const device = await registerDevice(store, { userId: user.id, client: "android" });
  const issued = await issueSession(store, { userId: user.id, deviceId: device.id });

  const suspended = await suspendUser(store, user.id);
  assert.equal(suspended.status, "suspended");
  assert.ok(suspended.suspendedAt);
  assert.equal((await resolveAccess(store, issued.accessToken)).status, "invalid");

  const closed = await closeUser(store, user.id);
  assert.equal(closed.status, "closed");
  assert.equal(closed.email, "person@example.com");
  await assert.rejects(createPendingUser(store, { email: "person@example.com" }), (error: unknown) => {
    assert.ok(error instanceof AccountStateError);
    assert.equal(error.reason, "duplicate");
    return true;
  });
});

test("one session can be revoked without deleting the account", async () => {
  const { store, issued } = await activeSession();
  await revokeSession(store, issued.session.id, "operator");
  assert.equal((await resolveAccess(store, issued.accessToken)).status, "invalid");
  assert.equal((await store.findUser(issued.user.id))?.status, "active");
});

test("the same mobile installation reuses one device and revokes the prior session", async () => {
  const store = createMemoryAccountStore();
  const user = await activateUser(store, (await createPendingUser(store, { email: "phone@example.com" })).id);
  const installationId = "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f";
  const firstDevice = await registerDevice(store, { userId: user.id, client: "ios", installationId, label: "iPhone" });
  const first = await issueSession(store, { userId: user.id, deviceId: firstDevice.id });
  const secondDevice = await registerDevice(store, { userId: user.id, client: "ios", installationId, label: "iPhone" });
  assert.equal(secondDevice.id, firstDevice.id);
  assert.equal((await store.listDevicesForUser(user.id)).filter((device) => !device.revokedAt).length, 1);
  assert.equal((await resolveAccess(store, first.accessToken)).status, "invalid");
  const second = await issueSession(store, { userId: user.id, deviceId: secondDevice.id });
  assert.equal((await resolveAccess(store, second.accessToken)).status, "user");
  const other = await registerDevice(store, { userId: user.id, client: "ios", installationId: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e90" });
  assert.notEqual(other.id, firstDevice.id);
});
