import { brandColors } from "./brand.ts";

/**
 * Semantic colors for UI. Filled controls and small text use contrast-safe
 * variants of the approved palette. White on #16A34A is about 3.3:1, which
 * fails WCAG AA for normal text, so primarySolid is darker in light mode.
 * Dark mode uses the approved bright green with near-black text.
 */
export type SemanticColors = {
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  border: string;
  primary: string;
  primarySolid: string;
  primarySolidHover: string;
  primarySolidActive: string;
  primaryForeground: string;
  bright: string;
  deep: string;
  link: string;
  positive: string;
  positiveText: string;
  negative: string;
  negativeText: string;
  negativeSolid: string;
  negativeSolidHover: string;
  negativeForeground: string;
  warning: string;
  warningText: string;
  ring: string;
  disabled: string;
  disabledForeground: string;
};

export const lightColors = {
  background: brandColors.background,
  surface: brandColors.cardSurface,
  foreground: brandColors.mainText,
  muted: brandColors.mutedText,
  border: "#E2E8F0",
  primary: brandColors.primaryGreen,
  primarySolid: "#166534",
  primarySolidHover: "#15803D",
  primarySolidActive: brandColors.deepGreen,
  primaryForeground: "#FFFFFF",
  bright: brandColors.brightGreen,
  deep: brandColors.deepGreen,
  link: brandColors.deepGreen,
  positive: brandColors.positiveData,
  positiveText: "#166534",
  negative: brandColors.negativeData,
  negativeText: "#B91C1C",
  negativeSolid: brandColors.negativeData,
  negativeSolidHover: "#B91C1C",
  negativeForeground: "#FFFFFF",
  warning: brandColors.warning,
  warningText: "#92400E",
  ring: "#166534",
  disabled: "#E2E8F0",
  disabledForeground: brandColors.mutedText,
} as const satisfies SemanticColors;

export const darkColors = {
  background: brandColors.darkBackground,
  surface: brandColors.darkCardSurface,
  foreground: brandColors.darkMainText,
  muted: brandColors.darkMutedText,
  border: brandColors.darkBorder,
  primary: brandColors.darkPrimaryGreen,
  primarySolid: brandColors.darkPrimaryGreen,
  primarySolidHover: "#4ADE80",
  primarySolidActive: brandColors.primaryGreen,
  primaryForeground: brandColors.darkBackground,
  bright: brandColors.brightGreen,
  deep: brandColors.deepGreen,
  link: brandColors.darkPrimaryGreen,
  positive: brandColors.darkPrimaryGreen,
  positiveText: brandColors.darkPrimaryGreen,
  negative: brandColors.negativeData,
  negativeText: "#F87171",
  negativeSolid: brandColors.negativeData,
  negativeSolidHover: "#B91C1C",
  negativeForeground: "#FFFFFF",
  warning: brandColors.warning,
  warningText: brandColors.warning,
  ring: brandColors.darkPrimaryGreen,
  disabled: "#1E293B",
  disabledForeground: "#64748B",
} as const satisfies SemanticColors;

export const colors = {
  light: lightColors,
  dark: darkColors,
} as const;
