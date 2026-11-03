import assert from "node:assert/strict";
import test from "node:test";
import { comparePath, compareSlugKey, parseCompareSelection, withSlug, withoutSlug } from "./selection.ts";

test("restores a shared comparison and keeps at most four unique issues", () => {
  const parsed = parseCompareSelection({
    ipo: ["stored-mills", "stored-mills", "other-mills", "NOT VALID", "third-mills", "fourth-mills", "fifth-mills"],
    q: "  mills  ",
  });
  assert.deepEqual(parsed.slugs, ["stored-mills", "other-mills", "third-mills", "fourth-mills"]);
  assert.equal(parsed.overflow, true);
  assert.equal(parsed.q, "mills");
  assert.equal(compareSlugKey(parsed.slugs), "stored-mills,other-mills,third-mills,fourth-mills");
  assert.equal(
    comparePath(parsed.slugs, parsed.q),
    "/compare?ipo=stored-mills&ipo=other-mills&ipo=third-mills&ipo=fourth-mills&q=mills",
  );
  assert.deepEqual(withSlug(parsed.slugs, "fifth-mills"), parsed.slugs);
  assert.deepEqual(withoutSlug(parsed.slugs, "other-mills"), ["stored-mills", "third-mills", "fourth-mills"]);
  assert.equal(comparePath(withoutSlug(["stored-mills"], "stored-mills")), "/compare");
});

test("a single issue parameter is restored in order", () => {
  const parsed = parseCompareSelection({ ipo: "alpha-mills" });
  assert.deepEqual(parsed.slugs, ["alpha-mills"]);
  assert.equal(parsed.overflow, false);
  assert.deepEqual(withSlug(parsed.slugs, "beta-mills"), ["alpha-mills", "beta-mills"]);
  assert.deepEqual(withSlug(["alpha-mills", "beta-mills"], "alpha-mills"), ["alpha-mills", "beta-mills"]);
});
