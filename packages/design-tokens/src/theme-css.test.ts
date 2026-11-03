import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { brandColors } from "./brand.ts";
import { renderThemeCss } from "./theme-css.ts";

const themePath = resolve(dirname(fileURLToPath(import.meta.url)), "../theme.css");

test("theme stylesheet is generated from the token source", () => {
  const css = readFileSync(themePath, "utf8");
  assert.equal(css, renderThemeCss());
});

test("approved brand colors are present in the generated theme", () => {
  const css = renderThemeCss();
  for (const hex of Object.values(brandColors)) {
    assert.match(css, new RegExp(hex, "i"));
  }
});
