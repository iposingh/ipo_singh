import assert from "node:assert/strict";
import test from "node:test";
import { browseModeChoices, sectionIdsForBrowseMode } from "./browse-mode.ts";

test("browse modes map to Current & Upcoming versus Listed catalogue sections", () => {
  assert.deepEqual(
    browseModeChoices.map((choice) => choice.label),
    ["Current & Upcoming", "Listed"],
  );
  assert.deepEqual(sectionIdsForBrowseMode("current"), ["open", "upcoming", "allotment"]);
  assert.deepEqual(sectionIdsForBrowseMode("listed"), ["listed"]);
  assert.equal(sectionIdsForBrowseMode("current").includes("listed"), false);
});
