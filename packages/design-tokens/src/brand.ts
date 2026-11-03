/** Approved Growth Arrow Green palette. Do not replace these values with nearby shades. */
export const brandColors = {
  primaryGreen: "#16A34A",
  brightGreen: "#22C55E",
  deepGreen: "#065F46",
  mainText: "#0F172A",
  background: "#F8FAFC",
  cardSurface: "#FFFFFF",
  mutedText: "#64748B",
  positiveData: "#16A34A",
  negativeData: "#DC2626",
  warning: "#D97706",
  darkBackground: "#080F1A",
  darkCardSurface: "#142235",
  darkMainText: "#F8FAFC",
  darkMutedText: "#94A3B8",
  darkPrimaryGreen: "#22C55E",
  darkBorder: "#334155",
} as const;

export type BrandColor = keyof typeof brandColors;
