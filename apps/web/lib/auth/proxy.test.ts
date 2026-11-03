import assert from "node:assert/strict";
import test from "node:test";
import { proxyAuth, rewriteAuthSetCookie } from "./proxy.ts";

test("refresh cookies are scoped to the website auth path", () => {
  const header = "ipo_singh_refresh=secret; HttpOnly; SameSite=Strict; Path=/api/v1/auth; Max-Age=2592000";
  assert.match(rewriteAuthSetCookie(header), /Path=\/api\/auth/);
  assert.equal(rewriteAuthSetCookie(header).includes("/api/v1/auth"), false);
});

test("the proxy forwards cookies and does not call a vendor host", async () => {
  let requested = "";
  const fetchImpl: typeof fetch = async (input, init) => {
    requested = String(input);
    assert.equal(new Headers(init?.headers).get("cookie"), "ipo_singh_access=secret");
    assert.equal(new Headers(init?.headers).get("x-ipo-singh-client"), null);
    assert.equal(init?.body, undefined);
    return new Response(JSON.stringify({ account: { email: "reader@example.com" } }), {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": "ipo_singh_refresh=new; Path=/api/v1/auth" },
    });
  };
  const result = await proxyAuth({
    action: "session",
    method: "GET",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: null,
    body: null,
    fetchImpl,
  });
  assert.equal(result.status, 200);
  assert.equal(requested, "http://127.0.0.1:4000/api/v1/auth/session");
  assert.equal(result.body.includes("secret"), false);
  const blocked = await proxyAuth({
    action: "login",
    method: "POST",
    origin: "https://www.ipoguru.in",
    cookie: null,
    csrf: null,
    body: "{}",
    fetchImpl,
  });
  assert.equal(blocked.status, 503);
});

test("preference and session routes keep their methods and paths", async () => {
  const seen: { url: string; method: string; body: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    seen.push({ url: String(input), method: String(init?.method), body: String(init?.body ?? "") });
    return new Response("{}", { status: 200 });
  };
  await proxyAuth({
    action: "revoke-session",
    method: "POST",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: "csrf",
    body: "{\"sessionId\":\"018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f\"}",
    fetchImpl,
  });
  await proxyAuth({
    action: "preferences",
    method: "PATCH",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: "csrf",
    body: "{\"colorScheme\":\"dark\"}",
    fetchImpl,
  });
  await proxyAuth({
    action: "delete-account",
    method: "POST",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: "csrf",
    body: "{\"password\":\"Horse-battery-99\",\"confirmation\":\"DELETE\"}",
    fetchImpl,
  });
  assert.equal(seen[0]?.url, "http://127.0.0.1:4000/api/v1/auth/sessions/revoke");
  assert.equal(seen[0]?.method, "POST");
  assert.equal(seen[1]?.url, "http://127.0.0.1:4000/api/v1/auth/preferences");
  assert.equal(seen[1]?.method, "PATCH");
  assert.equal(seen[1]?.body, "{\"colorScheme\":\"dark\"}");
  assert.equal(seen[2]?.url, "http://127.0.0.1:4000/api/v1/auth/account/delete");
  assert.equal(seen[2]?.method, "POST");
});
