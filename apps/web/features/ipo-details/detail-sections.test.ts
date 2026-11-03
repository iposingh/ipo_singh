import assert from "node:assert/strict";
import test from "node:test";
import { ipoDetailSectionHref, ipoDetailSections, isIpoDetailSectionId } from "./detail-sections.ts";

test("IPO detail sections stay anchored and cover the published page order", () => {
  assert.deepEqual(
    ipoDetailSections.map((section) => section.id),
    ["overview", "gmp", "subscription", "financials", "allotment", "listing", "documents"],
  );
  assert.equal(ipoDetailSectionHref("gmp"), "#gmp");
  assert.equal(ipoDetailSectionHref("documents"), "#documents");
  assert.equal(isIpoDetailSectionId("listing"), true);
  assert.equal(isIpoDetailSectionId("gmp-page"), false);
  assert.equal(new Set(ipoDetailSections.map((section) => section.id)).size, ipoDetailSections.length);
});
