import assert from "node:assert/strict";
import test from "node:test";
import { brandColors, colors, layout, sizing } from "@ipo-singh/design-tokens";
import { mobileTheme, tokenWeightsMatchTheme } from "../theme/theme.ts";
import {
  dataFreshnessCopy,
  gmpIndicatorCopy,
  listingLifecycleLabel,
  prepareSearchText,
  statusLabel,
  statusTone,
  subscriptionIndicatorCopy,
} from "./copy.ts";
import { pagePadding, screenContentInset } from "./layout.ts";
import { primaryTabTitles, primaryTabs } from "./tabs.ts";

test("Growth Arrow Green light and dark tokens match the approved palette", () => {
  assert.equal(brandColors.background, "#F8FAFC");
  assert.equal(brandColors.cardSurface, "#FFFFFF");
  assert.equal(brandColors.mainText, "#0F172A");
  assert.equal(brandColors.primaryGreen, "#16A34A");
  assert.equal(brandColors.darkBackground, "#080F1A");
  assert.equal(brandColors.darkCardSurface, "#142235");
  assert.equal(brandColors.darkMainText, "#F8FAFC");
  assert.equal(brandColors.darkPrimaryGreen, "#22C55E");
  assert.equal(colors.light.background, "#F8FAFC");
  assert.equal(colors.light.surface, "#FFFFFF");
  assert.equal(colors.light.foreground, "#0F172A");
  assert.equal(colors.dark.background, "#080F1A");
  assert.equal(colors.dark.surface, "#142235");
  assert.equal(colors.dark.foreground, "#F8FAFC");
  assert.equal(colors.dark.primary, "#22C55E");
  assert.equal(mobileTheme.colors.light.primary, "#16A34A");
  assert.equal(mobileTheme.sizing.touchTarget, sizing.touchTarget);
  assert.equal(tokenWeightsMatchTheme(), true);
});

test("page padding follows the website breakpoints and the content column stays 1120", () => {
  assert.equal(pagePadding(320), 16);
  assert.equal(pagePadding(767), 16);
  assert.equal(pagePadding(768), 24);
  assert.equal(pagePadding(1023), 24);
  assert.equal(pagePadding(1024), 32);
  assert.equal(pagePadding(1280), 32);
  assert.equal(screenContentInset(1280).maxWidth, layout.contentMaxWidth);
  assert.equal(screenContentInset(320).paddingHorizontal, 16);
});

test("primary navigation is five tabs and does not add GMP or Subscription", () => {
  assert.deepEqual(primaryTabTitles(), ["Home", "IPOs", "Watchlist", "Alerts", "Settings"]);
  assert.equal(primaryTabs[0]?.accessibilityLabel, "IPO Singh home dashboard");
  assert.equal(primaryTabs[1]?.route, "ipos");
  assert.equal(primaryTabs[4]?.route, "settings");
  assert.equal(primaryTabTitles().includes("GMP"), false);
  assert.equal(primaryTabTitles().includes("Subscription"), false);
});

test("status, GMP, subscription, and freshness keep missing distinct from zero", () => {
  assert.equal(statusLabel(null), "Status unavailable");
  assert.equal(statusTone(null), null);
  assert.equal(statusTone("open"), "positive");
  assert.equal(statusTone("upcoming"), "warning");
  assert.equal(statusTone("closed"), "neutral");

  const missingGmp = gmpIndicatorCopy({ gmpAmountRupees: null, freshness: "missing" });
  assert.equal(missingGmp.value, "GMP unavailable");
  assert.equal(missingGmp.disclaimer, null);

  const zeroGmp = gmpIndicatorCopy({ gmpAmountRupees: 0, freshness: "stale" });
  assert.match(zeroGmp.value, /₹0/);
  assert.notEqual(zeroGmp.value, "GMP unavailable");
  assert.equal(zeroGmp.freshness, "Delayed");
  assert.match(zeroGmp.disclaimer ?? "", /unofficial/);

  assert.deepEqual(subscriptionIndicatorCopy(null), { value: "Subscription unavailable", missing: true });
  assert.deepEqual(subscriptionIndicatorCopy(0), { value: "0x", missing: false });

  const freshness = dataFreshnessCopy({ retrievedAt: null, freshness: "missing" });
  assert.equal(freshness.freshness, "Updated time unavailable");
  assert.equal(freshness.updated, "Last updated: Unavailable");
});

test("search text rejects short, empty, and unsafe queries before a request", () => {
  assert.equal(prepareSearchText("  ").status, "empty");
  assert.equal(prepareSearchText("a").status, "short");
  assert.equal(prepareSearchText("a<b").status, "invalid");
  assert.equal(prepareSearchText("a\nb").status, "invalid");
  assert.deepEqual(prepareSearchText("  polymers  "), { status: "ready", text: "polymers" });
});

test("listing lifecycle keeps Allotment Awaited distinct from Allotment Out", () => {
  assert.equal(listingLifecycleLabel({ status: "closed" }), "Allotment Awaited");
  assert.equal(listingLifecycleLabel({ status: "allotment", allotmentConfirmed: false }), "Allotment Awaited");
  assert.equal(listingLifecycleLabel({ status: "allotment", allotmentConfirmed: true }), "Allotment Out");
  assert.notEqual(listingLifecycleLabel({ status: "closed", allotmentConfirmed: false }), "Allotment Out");
  assert.equal(listingLifecycleLabel({ status: "listed", allotmentConfirmed: true }), "Listed");
  assert.equal(listingLifecycleLabel({ status: "open", allotmentConfirmed: true }), "Open");
});
