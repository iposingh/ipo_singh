"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { readCsrfToken } from "@/features/auth/csrf";
import {
  applyColorScheme,
  isThemeChoice,
  resolveColorScheme,
  themeChangeEvent,
  themeStorageKey,
  type ThemeChoice,
  type ThemeSnapshot,
} from "@/lib/theme/theme";

type ThemeContextValue = ThemeSnapshot & {
  setTheme: (choice: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

let cachedSnapshot: ThemeSnapshot = { choice: "system", colorScheme: "light" };

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readChoice(): ThemeChoice {
  const stored = localStorage.getItem(themeStorageKey);
  return isThemeChoice(stored) ? stored : "system";
}

function readSnapshot(): ThemeSnapshot {
  const choice = readChoice();
  const colorScheme = resolveColorScheme(choice, prefersDark());
  if (cachedSnapshot.choice === choice && cachedSnapshot.colorScheme === colorScheme) {
    return cachedSnapshot;
  }
  cachedSnapshot = { choice, colorScheme };
  return cachedSnapshot;
}

function subscribe(onStoreChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    applyColorScheme(readChoice(), media.matches);
    onStoreChange();
  };
  media.addEventListener("change", onChange);
  window.addEventListener(themeChangeEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(themeChangeEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const serverSnapshot: ThemeSnapshot = { choice: "system", colorScheme: "light" };

function getServerSnapshot(): ThemeSnapshot {
  return serverSnapshot;
}

export function setThemeChoice(choice: ThemeChoice): void {
  localStorage.setItem(themeStorageKey, choice);
  applyColorScheme(choice, prefersDark());
  window.dispatchEvent(new Event(themeChangeEvent));
}

function persistThemeChoice(choice: ThemeChoice): void {
  setThemeChoice(choice);
  const csrf = readCsrfToken(document.cookie);
  if (!csrf) return;
  void fetch("/api/auth/preferences", {
    method: "PATCH",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({ colorScheme: choice }),
  }).catch(() => undefined);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, getServerSnapshot);

  return (
    <ThemeContext.Provider value={{ ...snapshot, setTheme: persistThemeChoice }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return value;
}
