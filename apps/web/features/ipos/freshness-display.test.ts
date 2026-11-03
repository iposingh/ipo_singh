import assert from "node:assert/strict";
import test from "node:test";
import { sharedStamp } from "./freshness-display.ts";

test("a shared stamp is shown once and mixed stamps are not collapsed", () => {
  assert.equal(sharedStamp(["2026-10-28T17:05:00.000Z", "2026-10-28T17:05:00.000Z"]), "2026-10-28T17:05:00.000Z");
  assert.equal(sharedStamp(["2026-10-28T17:05:00.000Z", "2026-10-28T18:05:00.000Z"]), "mixed");
  assert.equal(sharedStamp(["2026-10-28T17:05:00.000Z", null]), "mixed");
  assert.equal(sharedStamp([null, null]), null);
});
