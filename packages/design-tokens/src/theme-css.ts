import { darkColors, lightColors } from "./color.ts";
import { finish } from "./finish.ts";
import { motion } from "./motion.ts";
import { radius } from "./radius.ts";
import { shadow } from "./shadow.ts";

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function declarations(values: Record<string, string | number>): string {
  return Object.entries(values)
    .map(([key, value]) => `  --ds-${kebab(key)}: ${value};`)
    .join("\n");
}

function block(selector: string, values: Record<string, string | number>): string {
  return `${selector} {\n${declarations(values)}\n}`;
}

const shared = {
  radiusSm: `${radius.sm}px`,
  radiusMd: `${radius.md}px`,
  radiusLg: `${radius.lg}px`,
  radiusXl: `${radius.xl}px`,
  radiusFull: `${radius.full}px`,
  durationFast: `${motion.durationFastMs}ms`,
  durationNormal: `${motion.durationNormalMs}ms`,
  durationSlow: `${motion.durationSlowMs}ms`,
  easingStandard: motion.easingStandard,
};

function schemeVars(mode: "light" | "dark"): Record<string, string | number> {
  const colors = mode === "light" ? lightColors : darkColors;
  const surface = finish[mode];
  const shade = shadow[mode];
  return {
    ...colors,
    ...shared,
    shadowCard: shade.card,
    shadowCardHover: shade.cardHover,
    shadowHeader: shade.header,
    pageAtmosphere: surface.pageAtmosphere,
    surfaceFill: surface.surfaceFill,
    surfaceFillHover: surface.surfaceFillHover,
    borderAccent: surface.borderAccent,
    borderAccentHover: surface.borderAccentHover,
    buttonFill: surface.buttonFill,
    buttonFillHover: surface.buttonFillHover,
    buttonShadow: surface.buttonShadow,
    headerFill: surface.headerFill,
    controlFill: surface.controlFill,
    insetHighlight: surface.insetHighlight,
  };
}

export function renderThemeCss(): string {
  const light = schemeVars("light");
  const dark = schemeVars("dark");
  const lightScheme = Object.fromEntries(Object.entries(light).filter(([key]) => !(key in shared))) as Record<string, string | number>;
  const darkScheme = Object.fromEntries(Object.entries(dark).filter(([key]) => !(key in shared))) as Record<string, string | number>;

  return `/* Generated from packages/design-tokens/src. Do not edit by hand. */
${block(":root", light)}

${block('[data-color-scheme="light"]', lightScheme)}

${block('[data-color-scheme="dark"]', darkScheme)}

@media (prefers-color-scheme: dark) {
${block('  :root:not([data-color-scheme="light"])', darkScheme)}
}
`;
}
