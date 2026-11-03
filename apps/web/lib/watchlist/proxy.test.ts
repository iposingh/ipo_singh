import assert from "node:assert/strict";
import test from "node:test";
import { proxyWatchlist } from "./proxy.ts";

test("watchlist requests stay on the IPO Singh API", async () => {
  const seen: { url: string; method: string; csrf: string | null; body: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    seen.push({
      url: String(input),
      method: String(init?.method),
      csrf: new Headers(init?.headers).get("x-csrf-token"),
      body: String(init?.body ?? ""),
    });
    return new Response("{}", { status: 200 });
  };
  await proxyWatchlist({
    method: "POST",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: "csrf",
    body: "{\"ipoId\":\"fixture-mills\"}",
    fetchImpl,
  });
  await proxyWatchlist({
    method: "DELETE",
    ipoId: "fixture-mills",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: "csrf",
    body: null,
    fetchImpl,
  });
  const blocked = await proxyWatchlist({
    method: "GET",
    origin: "https://www.ipoguru.in",
    cookie: null,
    csrf: null,
    body: null,
    fetchImpl,
  });
  assert.equal(seen[0]?.url, "http://127.0.0.1:4000/api/v1/watchlist");
  assert.equal(seen[0]?.method, "POST");
  assert.equal(seen[0]?.csrf, "csrf");
  assert.equal(seen[1]?.url, "http://127.0.0.1:4000/api/v1/watchlist/fixture-mills");
  assert.equal(seen[1]?.body, "");
  assert.equal(blocked.status, 503);
  assert.equal(seen.length, 2);
});
