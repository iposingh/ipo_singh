export const themeStorageKey = "ipo-singh-theme";
export const themeChangeEvent = "ipo-singh-theme-change";

export type ThemeChoice = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";

export type ThemeSnapshot = {
  choice: ThemeChoice;
  colorScheme: ColorScheme;
};

export function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveColorScheme(choice: ThemeChoice, prefersDark: boolean): ColorScheme {
  if (choice === "dark") {
    return "dark";
  }
  if (choice === "light") {
    return "light";
  }
  return prefersDark ? "dark" : "light";
}

export function applyColorScheme(choice: ThemeChoice, prefersDark: boolean): ColorScheme {
  const colorScheme = resolveColorScheme(choice, prefersDark);
  const root = document.documentElement;
  root.dataset.theme = choice;
  root.dataset.colorScheme = colorScheme;
  root.style.colorScheme = colorScheme;
  return colorScheme;
}

export const themeInitScript = `(function(){try{var key=${JSON.stringify(themeStorageKey)};var stored=localStorage.getItem(key);var choice=stored==="light"||stored==="dark"||stored==="system"?stored:"system";var prefersDark=window.matchMedia("(prefers-color-scheme: dark)").matches;var colorScheme=choice==="dark"||(choice==="system"&&prefersDark)?"dark":"light";var root=document.documentElement;root.dataset.theme=choice;root.dataset.colorScheme=colorScheme;root.style.colorScheme=colorScheme;}catch(e){}})();`;
