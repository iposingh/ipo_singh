import { brandColors } from "./brand.ts";

/**
 * Semantic colors for UI. Filled controls and small text use contrast-safe
 * variants of the approved palette. White on #16A34A is about 3.3:1, which
 * fails WCAG AA for normal text, so light primarySolid uses strong emerald.
 * Dark mode uses lime for solid CTAs / selected controls with near-black text;
 * charts and directional gains keep brand green via link / positive tokens.
 */
export type SemanticColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  foreground: string;
  foregroundSecondary: string;
  muted: string;
  border: string;
  borderSubtle: string;
  primary: string;
  primarySolid: string;
  primarySolidHover: string;
  primarySolidActive: string;
  primaryForeground: string;
  bright: string;
  deep: string;
  accent: string;
  accentSubtle: string;
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
  information: string;
  informationText: string;
  ring: string;
  disabled: string;
  disabledForeground: string;
};

export const lightColors = {
  background: brandColors.background,
  surface: brandColors.cardSurface,
  surfaceElevated: brandColors.cardSurface,
  surfaceMuted: brandColors.secondarySurface,
  foreground: brandColors.mainText,
  foregroundSecondary: brandColors.secondaryText,
  muted: brandColors.mutedText,
  border: brandColors.border,
  borderSubtle: brandColors.border,
  primary: brandColors.primaryGreen,
  /** Strong emerald — white label text stays WCAG AA. */
  primarySolid: brandColors.deepGreen,
  primarySolidHover: "#166534",
  primarySolidActive: "#14532D",
  primaryForeground: "#FFFFFF",
  bright: brandColors.brightGreen,
  deep: brandColors.deepGreen,
  accent: brandColors.primaryGreen,
  accentSubtle: brandColors.softGreen,
  link: brandColors.deepGreen,
  positive: brandColors.positiveData,
  positiveText: brandColors.deepGreen,
  negative: brandColors.negativeData,
  negativeText: "#B91C1C",
  negativeSolid: brandColors.negativeData,
  negativeSolidHover: "#B91C1C",
  negativeForeground: "#FFFFFF",
  warning: brandColors.warning,
  warningText: brandColors.warning,
  information: brandColors.information,
  informationText: brandColors.information,
  ring: brandColors.deepGreen,
  disabled: brandColors.border,
  disabledForeground: brandColors.mutedText,
} as const satisfies SemanticColors;

export const darkColors = {
  background: brandColors.darkBackground,
  surface: brandColors.darkCardSurface,
  surfaceElevated: brandColors.darkSecondarySurface,
  surfaceMuted: brandColors.darkTertiarySurface,
  foreground: brandColors.darkMainText,
  foregroundSecondary: brandColors.darkSecondaryText,
  muted: brandColors.darkMutedText,
  border: brandColors.darkBorder,
  borderSubtle: brandColors.darkSubtleBorder,
  primary: brandColors.darkPrimaryGreen,
  /** Lime solid for CTAs and selected controls; text is near-black. */
  primarySolid: brandColors.accentLime,
  primarySolidHover: "#D4F85A",
  primarySolidActive: brandColors.darkPrimaryGreen,
  primaryForeground: brandColors.darkBackground,
  bright: brandColors.accentLime,
  deep: brandColors.darkSubtleBorder,
  accent: brandColors.accentLime,
  /** Soft lime wash for selected nav / filters (not neon fills). */
  accentSubtle: "#14301F",
  link: brandColors.darkPrimaryGreen,
  positive: brandColors.darkPrimaryGreen,
  positiveText: brandColors.darkPrimaryGreen,
  negative: brandColors.darkNegative,
  negativeText: "#F87171",
  negativeSolid: brandColors.darkNegative,
  negativeSolidHover: "#B91C1C",
  negativeForeground: "#FFFFFF",
  warning: brandColors.darkWarning,
  warningText: brandColors.darkWarning,
  information: brandColors.darkInformation,
  informationText: brandColors.darkInformation,
  ring: brandColors.accentLime,
  disabled: brandColors.darkHoverSurface,
  disabledForeground: "#64748B",
} as const satisfies SemanticColors;

export const colors = {
  light: lightColors,
  dark: darkColors,
} as const;
