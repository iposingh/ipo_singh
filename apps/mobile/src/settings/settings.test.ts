import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { primaryTabTitles, primaryTabs } from "../design/tabs.ts";
import {
  appVersionLabel,
  developerContactEmail,
  developerMailto,
  legalPageUrl,
  legalPages,
  shareWithFriendsMessage,
  shareWithFriendsUrl,
} from "./legal.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("primary navigation is Mainboard, SME, Calendar, Alerts, and Settings", () => {
  assert.deepEqual(primaryTabTitles(), ["Mainboard", "SME", "Calendar", "Alerts", "Settings"]);
  assert.equal(primaryTabs[0]?.route, "index");
  assert.equal(primaryTabs[1]?.route, "sme");
  assert.equal(primaryTabs[2]?.route, "calendar");
  assert.equal(primaryTabs[3]?.route, "notifications");
  assert.equal(primaryTabs[4]?.route, "settings");
  assert.equal(primaryTabTitles().includes("GMP"), false);
  assert.equal(primaryTabTitles().includes("Subscription"), false);
  assert.equal(primaryTabTitles().includes("Account"), false);
});

test("legal links use the website paths and the published developer email", () => {
  assert.equal(developerContactEmail, "iposingh.dev@gmail.com");
  assert.equal(developerMailto, "mailto:iposingh.dev@gmail.com");
  assert.deepEqual(
    legalPages.map((page) => page.path),
    ["/privacy", "/terms", "/about", "/contact"],
  );
  assert.equal(legalPages.find((page) => page.id === "contact")?.label, "Contact Us");
  assert.equal(legalPageUrl("privacy", "https://iposigh.example", "production"), "https://iposigh.example/privacy");
  assert.equal(legalPageUrl("terms", "https://iposigh.example", "production"), "https://iposigh.example/terms");
  assert.equal(legalPageUrl("about", undefined, "development"), null);
  assert.equal(legalPageUrl("privacy", "https://www.ipoguru.in", "production"), null);
  assert.equal(appVersionLabel("0.1.0"), "0.1.0");
  assert.equal(appVersionLabel("0.1.0", "12"), "0.1.0 (12)");
  assert.match(legalPages.find((page) => page.id === "privacy")?.summary ?? "", /does not collect PAN/i);
});

test("share with friends points at the public IPO Singh website", () => {
  assert.equal(shareWithFriendsUrl, "https://iposingh.com");
  assert.match(shareWithFriendsMessage, /iposingh\.com/);
  const settings = readFileSync(join(root, "src/screens/settings-screen.tsx"), "utf8");
  assert.match(settings, /Welcome, User/);
  assert.match(settings, /Share with friends/);
  assert.match(settings, /shareWithFriendsMessage/);
});
