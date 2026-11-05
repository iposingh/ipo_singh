import assert from "node:assert/strict";
import test from "node:test";
import { isIpoDetailPath, shouldPrefetchPath } from "./prefetch.ts";
import { footerNav, primaryNav } from "./routes.ts";

test("informational and account routes do not speculative-prefetch", () => {
  for (const route of footerNav) {
    assert.equal(shouldPrefetchPath(route.href), false, route.href);
  }
  assert.equal(shouldPrefetchPath("/account"), false);
  assert.equal(shouldPrefetchPath("/login"), false);
  assert.equal(shouldPrefetchPath("/watchlist"), false);
  assert.equal(shouldPrefetchPath("/blog/what-is-grey-market-premium"), false);
});

test("primary catalogue routes do not speculative-prefetch but remain navigable paths", () => {
  for (const route of primaryNav) {
    assert.equal(shouldPrefetchPath(route.href), false, route.href);
  }
  assert.equal(shouldPrefetchPath("/ipos/listed"), false);
  assert.equal(shouldPrefetchPath("/"), false);
});

test("IPO detail card paths are identified and do not speculative-prefetch", () => {
  assert.equal(isIpoDetailPath("/ipos/fixture-mills"), true);
  assert.equal(isIpoDetailPath("/ipos/mainboard"), false);
  assert.equal(isIpoDetailPath("/ipos/sme"), false);
  assert.equal(isIpoDetailPath("/ipos/listed"), false);
  assert.equal(shouldPrefetchPath("/ipos/fixture-mills"), false);
  assert.equal(shouldPrefetchPath("/ipos/fixture-mills?tab=gmp"), false);
});

test("prefetch policy never blocks recognising a normal internal href", () => {
  assert.equal(typeof shouldPrefetchPath("/ipos/mainboard"), "boolean");
  assert.equal(shouldPrefetchPath("https://example.com/about"), false);
});
