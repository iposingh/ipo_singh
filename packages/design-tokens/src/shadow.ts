/** Layered shadows for premium surface depth. Geometry of components stays unchanged. */
export const shadow = {
  light: {
    card: "0 1px 3px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.05)",
    cardHover: "0 2px 6px rgba(15, 23, 42, 0.05), 0 14px 32px rgba(22, 163, 74, 0.08)",
    header: "0 1px 0 rgba(15, 23, 42, 0.04)",
  },
  dark: {
    card: "0 10px 30px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.035)",
    cardHover: "0 14px 36px rgba(0, 0, 0, 0.34), 0 0 24px rgba(34, 197, 94, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
    header: "0 1px 0 rgba(36, 81, 59, 0.35)",
  },
} as const;
