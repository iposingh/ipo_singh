import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { articleCitationSchema, mobileSecureStoreKeys } from "@ipo-singh/contracts";
import { resolveApiOrigin } from "../api/origin.ts";
import { assertSecretKey, createMemorySecretStore } from "../auth/secrets.ts";
import { allotmentLink, documentLink } from "../detail/links.ts";
import { articleBodyParagraphs } from "../content/model.ts";
import { anonymousAllotmentEnabledKey, installationIdKey, pushTokenKey } from "../notifications/push.ts";
import { legalPageUrl } from "../settings/legal.ts";
import {
  allotmentCollectsSensitiveIdentity,
  forbiddenMobileSecretNames,
  installationIdPrivacyNote,
  isForbiddenMobileEnvKey,
  publicMobileEnvKeys,
  secureStoreKeyAllowlist,
} from "./privacy.ts";
import { safeRouteSlug } from "./routes.ts";
import { safeCitationUrl, safeExternalHttpsUrl } from "./urls.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("mobile env example stays public-only and names no provider or database secrets", () => {
  const example = readFileSync(join(root, ".env.example"), "utf8");
  assert.match(example, /Never bundle IPO Guru credentials/);
  for (const key of publicMobileEnvKeys) {
    assert.match(example, new RegExp(key));
  }
  for (const name of forbiddenMobileSecretNames) {
    assert.equal(example.toUpperCase().includes(`EXPO_PUBLIC_${name}`), false);
  }
  assert.equal(isForbiddenMobileEnvKey("EXPO_PUBLIC_IPO_GURU_API_KEY"), true);
  assert.equal(isForbiddenMobileEnvKey("EXPO_PUBLIC_MONGODB_URI"), true);
  assert.equal(isForbiddenMobileEnvKey("EXPO_PUBLIC_IPO_SINGH_API_ORIGIN"), false);
});

test("production API origins require https and refuse the data vendor", () => {
  assert.deepEqual(resolveApiOrigin("production", "https://api.iposigh.example"), {
    ok: true,
    origin: "https://api.iposigh.example",
  });
  assert.deepEqual(resolveApiOrigin("production", "http://api.iposigh.example"), { ok: false, failure: "invalid" });
  assert.deepEqual(resolveApiOrigin("production", "https://api.ipoguru.in"), { ok: false, failure: "vendor" });
  assert.deepEqual(resolveApiOrigin("production", "https://user:pass@api.example.com"), { ok: false, failure: "invalid" });
  assert.deepEqual(resolveApiOrigin("preview", "https://tmp.trycloudflare.com"), { ok: false, failure: "ephemeral" });
});

test("auth secrets stay on the allowlisted SecureStore keys", async () => {
  assert.deepEqual([...secureStoreKeyAllowlist].sort(), [
    anonymousAllotmentEnabledKey,
    installationIdKey,
    mobileSecureStoreKeys.access,
    mobileSecureStoreKeys.refresh,
    pushTokenKey,
  ].sort());
  const store = createMemorySecretStore();
  assert.throws(() => assertSecretKey("ipo-singh.catalogue.list"), /cannot be stored/);
  await assert.rejects(() => store.set("not-a-secret-key", "value"), /cannot be stored/);
});

test("external citation and document links reject unsafe schemes and credentials", () => {
  assert.equal(safeCitationUrl("https://www.nseindia.com/path"), "https://www.nseindia.com/path");
  assert.equal(safeCitationUrl("http://example.com"), null);
  assert.equal(safeCitationUrl("javascript:alert(1)"), null);
  assert.equal(safeCitationUrl("https://user:secret@example.com/x"), null);
  assert.equal(safeExternalHttpsUrl("https://www.ipoguru.in/offer"), null);
  assert.equal(documentLink("https://user:secret@example.com/doc.pdf"), null);
  assert.equal(documentLink("https://example.com/rhp.pdf"), "https://example.com/rhp.pdf");
  assert.equal(articleCitationSchema.safeParse({ label: "NSE", url: "http://example.com" }).success, false);
  assert.equal(articleCitationSchema.safeParse({ label: "NSE", url: "https://www.nseindia.com/" }).success, true);
});

test("allotment opens only verified registrar pages and never collects PAN", () => {
  assert.equal(allotmentCollectsSensitiveIdentity(), false);
  assert.match(installationIdPrivacyNote, /random UUID/i);
  assert.equal(allotmentLink({ name: "Bigshare Services", allotmentUrl: "https://ipo.bigshareonline.com/ipo_status.html" }), "https://ipo.bigshareonline.com/ipo_status.html");
  assert.equal(allotmentLink({ name: "Unknown", allotmentUrl: "https://evil.example/steal" }), null);
});

test("legal pages resolve on https sites and article bodies strip markup", () => {
  assert.equal(legalPageUrl("privacy", "https://iposigh.example", "production"), "https://iposigh.example/privacy");
  assert.equal(legalPageUrl("privacy", "http://iposigh.example", "production"), null);
  assert.equal(legalPageUrl("terms", "https://www.ipoguru.in", "production"), null);
  assert.deepEqual(articleBodyParagraphs("One.\n\nTwo <b>bold</b>."), ["One.", "Two bold."]);
});

test("deep-link route slugs reject path injection and non-slug values", () => {
  assert.equal(safeRouteSlug("fixture-mills"), "fixture-mills");
  assert.equal(safeRouteSlug(["fixture-mills", "extra"]), "fixture-mills");
  assert.equal(safeRouteSlug("../etc/passwd"), null);
  assert.equal(safeRouteSlug("javascript:alert(1)"), null);
  assert.equal(safeRouteSlug("UPPER"), null);
  assert.equal(safeRouteSlug(""), null);
  assert.equal(safeRouteSlug(undefined), null);
});
