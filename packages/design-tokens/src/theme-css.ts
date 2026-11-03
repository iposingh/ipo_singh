import { darkColors, lightColors } from "./color.ts";
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

export function renderThemeCss(): string {
  const light = { ...lightColors, ...shared, shadowCard: shadow.light.card };
  const dark = { ...darkColors, shadowCard: shadow.dark.card };

  return `/* Generated from packages/design-tokens/src. Do not edit by hand. */
${block(":root", light)}

${block('[data-color-scheme="light"]', { ...lightColors, shadowCard: shadow.light.card })}

${block('[data-color-scheme="dark"]', dark)}

@media (prefers-color-scheme: dark) {
${block('  :root:not([data-color-scheme="light"])', dark)}
}
`;
}
