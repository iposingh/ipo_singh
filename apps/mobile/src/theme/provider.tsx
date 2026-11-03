import { colors, type SemanticColors } from "@ipo-singh/design-tokens";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { isThemeChoice, resolveColorScheme, themeStorageKey, type ColorScheme, type ThemeChoice } from "./preference";
import { readDevicePreference, writeDevicePreference } from "./preference-storage";

type ThemeContextValue = {
  choice: ThemeChoice;
  colorScheme: ColorScheme;
  palette: SemanticColors;
  storageNote: string | null;
  setTheme: (choice: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [storageNote, setStorageNote] = useState<string | null>(null);
  const themeGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    const generation = themeGeneration.current;
    void (async () => {
      try {
        const stored = await readDevicePreference(themeStorageKey);
        if (!active || themeGeneration.current !== generation) return;
        if (isThemeChoice(stored)) setChoice(stored);
        setStorageNote(null);
      } catch {
        if (!active || themeGeneration.current !== generation) return;
        setStorageNote("The saved theme could not be read. System appearance is in use.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setTheme = useCallback((next: ThemeChoice) => {
    themeGeneration.current += 1;
    const generation = themeGeneration.current;
    setChoice(next);
    void writeDevicePreference(themeStorageKey, next).then(
      () => {
        if (themeGeneration.current === generation) setStorageNote(null);
      },
      () => {
        if (themeGeneration.current === generation) setStorageNote("The theme choice could not be saved on this device.");
      },
    );
  }, []);

  const colorScheme = resolveColorScheme(choice, systemScheme === "dark");
  const palette = colors[colorScheme];
  const value = useMemo(
    () => ({ choice, colorScheme, palette, storageNote, setTheme }),
    [choice, colorScheme, palette, setTheme, storageNote],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider is missing.");
  return value;
}
