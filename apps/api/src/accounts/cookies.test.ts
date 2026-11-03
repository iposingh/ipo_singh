import assert from "node:assert/strict";
import test from "node:test";
import { clearSessionCookieHeaders, readCookie, sessionCookieHeaders } from "./cookies.ts";

const values = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  csrfToken: "csrf-token",
  accessMaxAgeSeconds: 900,
  refreshMaxAgeSeconds: 2_592_000,
};

test("website session cookies stay script-inaccessible except the CSRF echo", () => {
  const headers = sessionCookieHeaders(values, false);
  assert.match(headers[0] ?? "", /^ipo_singh_access=access-token; HttpOnly; SameSite=Lax; Path=\/; Max-Age=900$/);
  assert.match(headers[1] ?? "", /HttpOnly; SameSite=Strict; Path=\/api\/v1\/auth; Max-Age=2592000$/);
  assert.match(headers[2] ?? "", /^ipo_singh_csrf=csrf-token; SameSite=Lax; Path=\/; Max-Age=900$/);
  assert.equal(headers.join("\n").includes("Secure"), false);
  assert.equal((headers[2] ?? "").includes("HttpOnly"), false);

  const secure = sessionCookieHeaders(values, true);
  assert.match(secure[0] ?? "", /Secure$/);
  assert.match(secure[2] ?? "", /Secure$/);
  assert.equal((secure[2] ?? "").includes("HttpOnly"), false);

  const cleared = clearSessionCookieHeaders(true);
  assert.match(cleared[0] ?? "", /Max-Age=0/);
  assert.match(cleared[1] ?? "", /Max-Age=0/);
});

test("cookie parsing returns one named value", () => {
  assert.equal(readCookie("ipo_singh_access=abc; ipo_singh_csrf=def", "ipo_singh_csrf"), "def");
  assert.equal(readCookie(undefined, "ipo_singh_access"), null);
  assert.equal(readCookie("other=1", "ipo_singh_access"), null);
});
