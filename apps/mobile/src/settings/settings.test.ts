import assert from "node:assert/strict";
import test from "node:test";
import { primaryTabTitles, primaryTabs } from "../design/tabs.ts";
import { appVersionLabel, developerContactEmail, developerMailto, legalPageUrl, legalPages } from "./legal.ts";

test("primary navigation is Home, IPOs, Watchlist, Alerts, and Settings", () => {
  assert.deepEqual(primaryTabTitles(), ["Home", "IPOs", "Watchlist", "Alerts", "Settings"]);
  assert.equal(primaryTabs[0]?.route, "index");
  assert.equal(primaryTabs[1]?.route, "ipos");
  assert.equal(primaryTabs[2]?.route, "watchlist");
  assert.equal(primaryTabs[3]?.route, "notifications");
  assert.equal(primaryTabs[4]?.route, "settings");
  assert.equal(primaryTabTitles().includes("GMP"), false);
  assert.equal(primaryTabTitles().includes("Subscription"), false);
  assert.equal(primaryTabTitles().includes("SME IPOs"), false);
  assert.equal(primaryTabTitles().includes("Account"), false);
});

test("legal links use the website paths and the published developer email", () => {
  assert.equal(developerContactEmail, "iposingh.dev@gmail.com");
  assert.equal(developerMailto, "mailto:iposingh.dev@gmail.com");
  assert.deepEqual(
    legalPages.map((page) => page.path),
    ["/privacy", "/terms", "/about", "/contact"],
  );
  assert.equal(legalPageUrl("privacy", "https://iposigh.example", "production"), "https://iposigh.example/privacy");
  assert.equal(legalPageUrl("terms", "https://iposigh.example", "production"), "https://iposigh.example/terms");
  assert.equal(legalPageUrl("about", undefined, "development"), null);
  assert.equal(legalPageUrl("privacy", "https://www.ipoguru.in", "production"), null);
  assert.equal(appVersionLabel("0.1.0"), "0.1.0");
  assert.equal(appVersionLabel("0.1.0", "12"), "0.1.0 (12)");
  assert.match(legalPages.find((page) => page.id === "privacy")?.summary ?? "", /does not collect PAN/i);
});
