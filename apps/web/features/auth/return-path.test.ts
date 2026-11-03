import assert from "node:assert/strict";
import test from "node:test";
import { safeReturnPath } from "./return-path.ts";

test("return paths stay inside the site", () => {
  assert.equal(safeReturnPath("/ipos/eaaa-india-alternatives-ipo"), "/ipos/eaaa-india-alternatives-ipo");
  assert.equal(safeReturnPath("/login?next=/ipos/example"), "/login?next=/ipos/example");
  assert.equal(safeReturnPath("//evil.example"), null);
  assert.equal(safeReturnPath("https://evil.example/ipos"), null);
  assert.equal(safeReturnPath("/\\evil"), null);
  assert.equal(safeReturnPath("ipos/example"), null);
  assert.equal(safeReturnPath(null), null);
});
