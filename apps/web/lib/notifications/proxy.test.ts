import assert from "node:assert/strict";
import test from "node:test";
import { proxyNotifications } from "./proxy.ts";

test("notification requests stay on the IPO Singh API", async () => {
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    seen.push(String(input));
    return new Response("{}", { status: 200 });
  };
  await proxyNotifications({
    method: "GET",
    suffix: "unread-count",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: null,
    body: null,
    fetchImpl,
  });
  await proxyNotifications({
    method: "POST",
    suffix: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f/read",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: "csrf",
    body: "{}",
    fetchImpl,
  });
  const blocked = await proxyNotifications({
    method: "POST",
    suffix: "send-email",
    origin: "https://www.ipoguru.in",
    cookie: null,
    csrf: null,
    body: null,
    fetchImpl,
  });
  assert.equal(seen[0], "http://127.0.0.1:4000/api/v1/notifications/unread-count");
  assert.equal(seen[1], "http://127.0.0.1:4000/api/v1/notifications/018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f/read");
  assert.equal(blocked.status, 404);
  assert.equal(seen.length, 2);
});
