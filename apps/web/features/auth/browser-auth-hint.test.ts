import assert from "node:assert/strict";
import test from "node:test";
import { hasBrowserAuthHint } from "./browser-auth-hint.ts";

test("guest browsers without a CSRF cookie are treated as anonymous", () => {
  assert.equal(hasBrowserAuthHint(null), false);
  assert.equal(hasBrowserAuthHint(""), false);
  assert.equal(hasBrowserAuthHint("ipo_singh_access=hidden"), false);
});

test("a readable CSRF cookie is the auth hint used before private probes", () => {
  assert.equal(hasBrowserAuthHint("ipo_singh_csrf=token-value"), true);
  assert.equal(hasBrowserAuthHint("ipo_singh_access=secret; ipo_singh_csrf=token-value"), true);
});
