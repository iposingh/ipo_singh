import assert from "node:assert/strict";
import test from "node:test";
import { isThemeChoice, resolveColorScheme, themeStorageKey } from "./preference.ts";

test("theme preference matches the website choices and follows the device only for system", () => {
  assert.equal(themeStorageKey, "ipo-singh-theme");
  assert.equal(isThemeChoice("light"), true);
  assert.equal(isThemeChoice("dark"), true);
  assert.equal(isThemeChoice("system"), true);
  assert.equal(isThemeChoice("sepia"), false);
  assert.equal(isThemeChoice(null), false);
  assert.equal(resolveColorScheme("system", true), "dark");
  assert.equal(resolveColorScheme("system", false), "light");
  assert.equal(resolveColorScheme("light", true), "light");
  assert.equal(resolveColorScheme("dark", false), "dark");
});
