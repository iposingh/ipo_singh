import assert from "node:assert/strict";
import test from "node:test";
import { createToken, hashToken, isTokenShape, tokensMatch } from "./tokens.ts";

test("tokens are opaque and compared by hash", () => {
  const token = createToken();
  assert.equal(isTokenShape(token), true);
  assert.notEqual(token, hashToken(token));
  assert.equal(tokensMatch(hashToken(token), hashToken(token)), true);
  assert.equal(tokensMatch(hashToken(token), hashToken(createToken())), false);
  assert.equal(tokensMatch("short", "longer-value"), false);
  assert.equal(isTokenShape(""), false);
  assert.equal(isTokenShape("a".repeat(129)), false);
  assert.equal(isTokenShape("has space"), false);
});
