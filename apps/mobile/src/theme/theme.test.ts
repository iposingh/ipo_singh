import assert from "node:assert/strict";
import test from "node:test";
import { brandColors } from "@ipo-singh/design-tokens";
import { mobileTheme, tokenWeightsMatchTheme } from "./theme.ts";

test("mobile colors use the approved palette", () => {
  assert.equal(mobileTheme.colors.light.primary, brandColors.primaryGreen);
  assert.equal(mobileTheme.colors.light.background, brandColors.background);
  assert.equal(mobileTheme.colors.dark.background, brandColors.darkBackground);
  assert.equal(mobileTheme.sizing.touchTarget, 44);
  assert.equal(tokenWeightsMatchTheme(), true);
});
