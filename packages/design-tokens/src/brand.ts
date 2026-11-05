/**
 * Approved IPO Singh premium palette.
 * Light: off-white + emerald. Dark: midnight black + restrained lime accent.
 * Prefer semantic tokens in `color.ts` for UI; keep these hex values in sync.
 */
export const brandColors = {
  /** Emerald brand actions (light). */
  primaryGreen: "#16A34A",
  /** Standard bright brand green (charts, dark brand actions). */
  brightGreen: "#22C55E",
  /** Premium lime accent — dark selected controls and emphasis only. */
  accentLime: "#C6F432",
  /** Strong emerald for light hover / pressed / positive text. */
  deepGreen: "#15803D",
  /** Soft emerald wash for light selected backgrounds. */
  softGreen: "#DCFCE7",
  mainText: "#0F172A",
  secondaryText: "#334155",
  background: "#F8FAFC",
  cardSurface: "#FFFFFF",
  secondarySurface: "#F1F5F9",
  mutedText: "#64748B",
  border: "#E2E8F0",
  positiveData: "#15803D",
  negativeData: "#DC2626",
  warning: "#B45309",
  information: "#0284C7",
  /** Midnight page base (premium dark). */
  darkBackground: "#080B0C",
  /** Alternate deep navy used in layered fills. */
  darkDeepBlack: "#080F1A",
  darkCardSurface: "#101A20",
  darkSecondarySurface: "#14232A",
  darkTertiarySurface: "#18272C",
  darkHoverSurface: "#1B3032",
  darkMainText: "#F8FAFC",
  darkSecondaryText: "#CBD5E1",
  darkMutedText: "#94A3B8",
  darkPrimaryGreen: "#22C55E",
  darkBorder: "#26343B",
  darkSubtleBorder: "#24513B",
  darkNegative: "#EF4444",
  darkWarning: "#F59E0B",
  darkInformation: "#38BDF8",
} as const;

export type BrandColor = keyof typeof brandColors;
