import assert from "node:assert/strict";
import test from "node:test";
import { apiReportsMissingIpo, decideIpoProxyPath } from "./ipo-status-proxy.ts";

test("board browse paths are not treated as IPO detail addresses", () => {
  assert.deepEqual(decideIpoProxyPath("/ipos/mainboard"), { action: "next" });
  assert.deepEqual(decideIpoProxyPath("/ipos/sme"), { action: "next" });
  assert.deepEqual(decideIpoProxyPath("/ipos/listed"), { action: "next" });
});

test("invalid slug shapes are missing before any API call", () => {
  assert.deepEqual(decideIpoProxyPath("/ipos/Bad_Slug!!"), { action: "missing" });
  assert.deepEqual(decideIpoProxyPath("/ipos/UPPER"), { action: "missing" });
});

test("valid detail slugs ask the API whether the issue is stored", () => {
  assert.deepEqual(decideIpoProxyPath("/ipos/stored-mills"), { action: "check-api", slug: "stored-mills" });
});

test("API 404 means the slug is missing", async () => {
  const fetchImpl: typeof fetch = async () => new Response(null, { status: 404 });
  assert.equal(await apiReportsMissingIpo("gone", "https://api.test", fetchImpl), true);
});

test("API outage does not invent a permanent missing status", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("offline");
  };
  assert.equal(await apiReportsMissingIpo("stored-mills", "https://api.test", fetchImpl), false);
  assert.equal(await apiReportsMissingIpo("stored-mills", undefined, fetchImpl), false);
});

test("missing IPO HTML stays noindex and does not invent another company", async () => {
  const { missingIpoHtml } = await import("./missing-ipo-html.ts");
  const html = missingIpoHtml();
  assert.equal(html.includes('name="robots" content="noindex, nofollow"'), true);
  assert.equal(html.includes("No stored issue uses this address"), true);
  assert.equal(html.toLowerCase().includes("sample"), false);
});
