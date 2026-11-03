import assert from "node:assert/strict";
import test from "node:test";
import { createArgon2Hasher, createFastPasswordHasher } from "./passwords.ts";

test("argon2id verifies the same password and rejects a different one", async () => {
  const hasher = createArgon2Hasher();
  const encoded = await hasher.hash("Horse-battery-99");
  assert.equal(encoded.startsWith("argon2id$"), true);
  assert.equal(encoded.includes("Horse-battery-99"), false);
  assert.equal(await hasher.verify("Horse-battery-99", encoded), true);
  assert.equal(await hasher.verify("Horse-battery-98", encoded), false);
  assert.equal(await hasher.verify("Horse-battery-99", "not-a-hash"), false);
});

test("the fast hasher is only a test double", async () => {
  const hasher = createFastPasswordHasher();
  const encoded = await hasher.hash("Horse-battery-99");
  assert.equal(encoded.startsWith("fast$"), true);
  assert.equal(await hasher.verify("Horse-battery-99", encoded), true);
  assert.equal(await hasher.verify("other-password-1", encoded), false);
});
