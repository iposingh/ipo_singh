import assert from "node:assert/strict";
import test from "node:test";
import { requestJson } from "./client.ts";
import { MobileApiError } from "./errors.ts";
import { checkApiHealth, mobileHealthResponseSchema } from "./health.ts";

const healthBody = {
  status: "ok",
  service: "ipo-singh-api",
  version: "0.1.0",
  timestamp: "2026-10-25T16:00:00.000Z",
  timestampIst: "25 Oct 2026, 9:30 PM IST",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("a health check accepts the public health contract", async () => {
  const report = await checkApiHealth({
    appEnv: "production",
    configuredOrigin: "https://api.example.com",
    fetchImpl: async (url) => {
      assert.equal(String(url), "https://api.example.com/api/v1/health");
      return jsonResponse(200, healthBody);
    },
  });
  assert.equal(report.status, "ready");
  if (report.status === "ready") {
    assert.equal(report.health.service, "ipo-singh-api");
    assert.equal(report.health.timestampIst, healthBody.timestampIst);
  }
});

test("an offline device does not call the API", async () => {
  let called = false;
  const report = await checkApiHealth({
    appEnv: "development",
    configuredOrigin: undefined,
    offline: true,
    fetchImpl: async () => {
      called = true;
      return jsonResponse(200, healthBody);
    },
  });
  assert.equal(report.status, "offline");
  assert.equal(called, false);
});

test("a timeout, a cancellation, and a malformed body stay distinct", async () => {
  await assert.rejects(
    () =>
      requestJson({
        origin: "https://api.example.com",
        path: "/api/v1/health",
        schema: mobileHealthResponseSchema,
        timeoutMs: 20,
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      }),
    (error: unknown) => error instanceof MobileApiError && error.kind === "timeout",
  );

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      requestJson({
        origin: "https://api.example.com",
        path: "/api/v1/health",
        schema: mobileHealthResponseSchema,
        signal: controller.signal,
        fetchImpl: () => Promise.reject(new DOMException("aborted", "AbortError")),
      }),
    (error: unknown) => error instanceof MobileApiError && error.kind === "cancelled",
  );

  const malformed = await checkApiHealth({
    appEnv: "production",
    configuredOrigin: "https://api.example.com",
    fetchImpl: async () => jsonResponse(200, { status: "ok", issues: [{ name: "Sample IPO" }] }),
  });
  assert.equal(malformed.status, "unavailable");
  if (malformed.status === "unavailable") assert.equal(malformed.kind, "malformed");
});

test("an API error message is kept and a vendor origin is not requested", async () => {
  const http = await checkApiHealth({
    appEnv: "production",
    configuredOrigin: "https://api.example.com",
    fetchImpl: async () => jsonResponse(503, { code: "unavailable", message: "IPO data is temporarily unavailable." }),
  });
  assert.deepEqual(http, { status: "unavailable", kind: "http", message: "IPO data is temporarily unavailable." });

  let called = false;
  const vendor = await checkApiHealth({
    appEnv: "development",
    configuredOrigin: "https://api.ipoguru.in",
    fetchImpl: async () => {
      called = true;
      return jsonResponse(200, healthBody);
    },
  });
  assert.equal(vendor.status, "configuration");
  assert.equal(called, false);
});

test("a relative path cannot escape the API origin", async () => {
  await assert.rejects(
    () =>
      requestJson({
        origin: "https://api.example.com",
        path: "https://api.ipoguru.in/ipos",
        schema: mobileHealthResponseSchema,
        fetchImpl: async () => jsonResponse(200, healthBody),
      }),
    (error: unknown) => error instanceof MobileApiError && error.kind === "configuration",
  );
});
