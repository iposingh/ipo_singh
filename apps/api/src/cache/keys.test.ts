import assert from "node:assert/strict";
import test from "node:test";
import { CachePolicyError } from "./errors.ts";
import { cacheKey, hasSensitiveCacheId } from "./keys.ts";

test("IPO slugs that contain letter sequences like pan inside company are allowed", () => {
  assert.equal(hasSensitiveCacheId("bombay-coated-and-special-steels"), false);
  assert.equal(hasSensitiveCacheId("japan-steel-works"), false);
  assert.equal(hasSensitiveCacheId("acme-company-limited"), false);
  assert.doesNotThrow(() =>
    cacheKey({ version: 1, namespace: "public", resource: "issue", id: "acme-company-limited", environment: "prod" }),
  );
  assert.doesNotThrow(() =>
    cacheKey({ version: 1, namespace: "public", resource: "gmp", id: "bombay-coated-and-special-steels", environment: "prod" }),
  );
});

test("whole sensitive segments remain blocked", () => {
  assert.equal(hasSensitiveCacheId("user-1"), true);
  assert.equal(hasSensitiveCacheId("pan"), true);
  assert.equal(hasSensitiveCacheId("session"), true);
  assert.equal(hasSensitiveCacheId("my-token-value"), true);
  assert.throws(
    () => cacheKey({ version: 1, namespace: "public", resource: "issue", id: "user-1", environment: "prod" }),
    (error: unknown) => error instanceof CachePolicyError && error.reason === "sensitive-key",
  );
});
