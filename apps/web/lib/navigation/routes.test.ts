import assert from "node:assert/strict";
import test from "node:test";
import { bottomNav, isCurrentPath, primaryNav, siteRoutes } from "./routes.ts";

test("public routes have unique paths and labels", () => {
  const hrefs = siteRoutes.map((route) => route.href);
  const labels = siteRoutes.map((route) => route.label);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(siteRoutes.every((route) => route.href.startsWith("/")));
  assert.ok(siteRoutes.every((route) => route.description.length > 0));
});

test("primary navigation separates Mainboard and SME", () => {
  assert.deepEqual(
    primaryNav.map((route) => route.href),
    ["/ipos/mainboard", "/ipos/sme", "/ipo-calendar", "/compare", "/allotment", "/news"],
  );
  assert.deepEqual(
    bottomNav.map((route) => route.href),
    primaryNav.map((route) => route.href),
  );
  const hrefs: readonly string[] = primaryNav.map((route) => route.href);
  assert.equal(hrefs.includes("/gmp") || hrefs.includes("/subscription"), false);
});

test("current path matches a section without matching a shorter sibling", () => {
  assert.equal(isCurrentPath("/", "/"), true);
  assert.equal(isCurrentPath("/ipos/mainboard", "/"), false);
  assert.equal(isCurrentPath("/ipos/mainboard", "/ipos/mainboard"), true);
  assert.equal(isCurrentPath("/ipos/sme", "/ipos/mainboard"), false);
  assert.equal(isCurrentPath("/ipos/example", "/ipos/mainboard"), false);
  assert.equal(isCurrentPath("/ipos/mainboard/extra", "/ipos/mainboard"), true);
});
