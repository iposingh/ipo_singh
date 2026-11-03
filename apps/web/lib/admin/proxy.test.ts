import assert from "node:assert/strict";
import test from "node:test";
import { proxyAdmin } from "./proxy.ts";

test("admin requests stay on the IPO Singh API allowlist", async () => {
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    seen.push(String(input));
    return new Response("{}", { status: 200 });
  };
  await proxyAdmin({
    method: "GET",
    suffix: "session",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: null,
    body: null,
    fetchImpl,
  });
  await proxyAdmin({
    method: "POST",
    suffix: "roles",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: "csrf",
    body: "{}",
    fetchImpl,
  });
  const dashboard = await proxyAdmin({
    method: "GET",
    suffix: "dashboard",
    search: "",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: null,
    body: null,
    fetchImpl,
  });
  const blocked = await proxyAdmin({
    method: "POST",
    suffix: "ipos",
    origin: "https://www.ipoguru.in",
    cookie: null,
    csrf: null,
    body: "{}",
    fetchImpl,
  });
  const provider = await proxyAdmin({
    method: "GET",
    suffix: "provider",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: null,
    body: null,
    fetchImpl,
  });
  assert.equal(seen[0], "http://127.0.0.1:4000/api/v1/admin/session");
  assert.equal(seen[1], "http://127.0.0.1:4000/api/v1/admin/roles");
  assert.equal(dashboard.status, 200);
  assert.equal(seen[2], "http://127.0.0.1:4000/api/v1/admin/dashboard");
  assert.equal(blocked.status, 404);
  const banner = await proxyAdmin({
    method: "PATCH",
    suffix: "banners/banner-0123456789abcdef",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: "csrf",
    body: "{}",
    fetchImpl,
  });
  const upload = await proxyAdmin({
    method: "POST",
    suffix: "banners/banner-0123456789abcdef/images",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: "csrf",
    body: "{}",
    fetchImpl,
  });
  const allotment = await proxyAdmin({
    method: "GET",
    suffix: "allotment-verifications",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: null,
    body: null,
    fetchImpl,
  });
  const allotmentRetry = await proxyAdmin({
    method: "POST",
    suffix: "allotment-verifications/retry",
    origin: "http://127.0.0.1:4000",
    cookie: "ipo_singh_access=secret",
    csrf: "csrf",
    body: "{}",
    fetchImpl,
  });
  assert.equal(provider.status, 200);
  assert.equal(banner.status, 200);
  assert.equal(upload.status, 404);
  assert.equal(allotment.status, 200);
  assert.equal(allotmentRetry.status, 200);
  assert.equal(seen.includes("http://127.0.0.1:4000/api/v1/admin/banners/banner-0123456789abcdef"), true);
  assert.equal(seen.includes("http://127.0.0.1:4000/api/v1/admin/allotment-verifications"), true);
  assert.equal(seen.includes("http://127.0.0.1:4000/api/v1/admin/allotment-verifications/retry"), true);
  assert.equal(seen.some((url) => url.includes("ipoguru")), false);
});
