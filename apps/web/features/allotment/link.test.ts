import assert from "node:assert/strict";
import test from "node:test";
import { allotmentLink } from "./link.ts";

test("allotment links stay on verified registrar pages", () => {
  const portal = allotmentLink("https://in.mpms.mufg.com/Initial_Offer/public-issues.html");
  assert.equal(portal.href?.startsWith("https://in.mpms.mufg.com/"), true);
  assert.equal(portal.specific, false);
  assert.match(portal.note, /pending|select this IPO/i);

  const specific = allotmentLink("https://ipo.bigshareonline.com/ipo_status.html?ipo=EAAA");
  assert.equal(specific.specific, true);

  const guessed = allotmentLink("https://registrar.example/allotment");
  assert.equal(guessed.href, null);
  assert.match(guessed.note, /disabled/i);
  assert.equal(allotmentLink(null).href, null);
});
