import assert from "node:assert/strict";
import test from "node:test";
import { createFastPasswordHasher } from "./passwords.ts";
import { PasswordPolicyError, registerPasswordAccount, verifyLogin } from "./credentials.ts";
import { createMemoryAccountStore } from "./memory-store.ts";
import { AccountStateError, suspendUser } from "./session-service.ts";

const hasher = createFastPasswordHasher();

test("registration normalizes email and rejects a duplicate or a weak password", async () => {
  const store = createMemoryAccountStore();
  const user = await registerPasswordAccount(store, hasher, {
    email: " Person@Example.com ",
    password: "Horse-battery-99",
    displayName: "A Reader",
  });
  assert.equal(user.email, "person@example.com");
  assert.equal(user.status, "active");
  assert.equal(user.passwordHash?.includes("Horse-battery-99"), false);
  await assert.rejects(
    registerPasswordAccount(store, hasher, { email: "person@example.com", password: "Horse-battery-99" }),
    (error: unknown) => error instanceof AccountStateError && error.reason === "duplicate",
  );
  await assert.rejects(
    registerPasswordAccount(store, hasher, { email: "other@example.com", password: "short" }),
    (error: unknown) => error instanceof PasswordPolicyError,
  );
});

test("login failures look the same for an unknown email, a wrong password, and a suspended account", async () => {
  const store = createMemoryAccountStore();
  const user = await registerPasswordAccount(store, hasher, { email: "reader@example.com", password: "Horse-battery-99" });
  assert.equal((await verifyLogin(store, hasher, { email: "missing@example.com", password: "Horse-battery-99" })).status, "rejected");
  assert.equal((await verifyLogin(store, hasher, { email: "reader@example.com", password: "Wrong-password-1" })).status, "rejected");
  await suspendUser(store, user.id);
  assert.equal((await verifyLogin(store, hasher, { email: "reader@example.com", password: "Horse-battery-99" })).status, "rejected");
});
