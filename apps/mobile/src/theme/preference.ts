/** Same preference name as the website. This key stores appearance only, never an access token. */
export const themeStorageKey = "ipo-singh-theme";

export type ThemeChoice = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";

export function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveColorScheme(choice: ThemeChoice, prefersDark: boolean): ColorScheme {
  if (choice === "dark") return "dark";
  if (choice === "light") return "light";
  return prefersDark ? "dark" : "light";
}
