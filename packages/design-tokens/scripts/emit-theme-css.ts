import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderThemeCss } from "../src/theme-css.ts";

const directory = dirname(fileURLToPath(import.meta.url));
const destination = resolve(directory, "../theme.css");

writeFileSync(destination, renderThemeCss(), "utf8");
