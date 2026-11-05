import type { SemanticColors } from "@ipo-singh/design-tokens";
import type { ViewStyle } from "react-native";

/** Shared RN card surface polish — elevation + theme-aware border (no layout change). */
export function cardSurfaceStyle(palette: SemanticColors, colorScheme: "light" | "dark"): ViewStyle {
  const dark = colorScheme === "dark";
  return {
    backgroundColor: palette.surface,
    borderColor: dark ? palette.borderSubtle : palette.border,
    borderWidth: 1,
    shadowColor: dark ? "#000000" : "#0F172A",
    shadowOffset: { width: 0, height: dark ? 8 : 4 },
    shadowOpacity: dark ? 0.35 : 0.08,
    shadowRadius: dark ? 16 : 10,
    elevation: dark ? 6 : 3,
  };
}

/** Primary CTA elevation for light emerald / dark lime fills. */
export function primaryButtonSurfaceStyle(palette: SemanticColors, colorScheme: "light" | "dark", pressed: boolean): ViewStyle {
  const dark = colorScheme === "dark";
  return {
    backgroundColor: pressed ? palette.primarySolidActive : palette.primarySolid,
    shadowColor: dark ? palette.accent : palette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: pressed ? 0.12 : dark ? 0.28 : 0.22,
    shadowRadius: 10,
    elevation: pressed ? 2 : 4,
  };
}
