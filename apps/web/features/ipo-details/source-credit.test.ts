import assert from "node:assert/strict";
import test from "node:test";
import { isIpoGuruSource } from "./source-credit.ts";

test("IPO Guru credit follows the source name and not a sample label", () => {
  assert.equal(isIpoGuruSource("IPO Guru Pro"), true);
  assert.equal(isIpoGuruSource("ipo guru"), true);
  assert.equal(isIpoGuruSource("Sample layout"), false);
  assert.equal(isIpoGuruSource(null), false);
});
