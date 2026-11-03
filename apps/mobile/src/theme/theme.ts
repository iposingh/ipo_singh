import { colors, fontSize, fontWeight, radius, sizing, spacing } from "@ipo-singh/design-tokens";

/** React Native style values taken from the approved tokens. CSS font stacks and shadows stay on the website. */
export const mobileTheme = {
  colors,
  fontSize,
  fontWeight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  radius,
  sizing,
  spacing,
} as const;

export function tokenWeightsMatchTheme(): boolean {
  return (
    mobileTheme.fontWeight.regular === String(fontWeight.regular) &&
    mobileTheme.fontWeight.medium === String(fontWeight.medium) &&
    mobileTheme.fontWeight.semibold === String(fontWeight.semibold) &&
    mobileTheme.fontWeight.bold === String(fontWeight.bold)
  );
}
