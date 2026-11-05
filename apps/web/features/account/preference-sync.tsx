"use client";

import { useEffect } from "react";
import { setThemeChoice } from "@/components/theme/theme-provider";
import { accountSessionResponseSchema } from "@ipo-singh/contracts";
import { hasBrowserAuthHint } from "@/features/auth/browser-auth-hint";
import { isThemeChoice, themeStorageKey } from "@/lib/theme/theme";

/** Apply a signed-in color scheme locally. Guests keep the browser choice. */
export function PreferenceSync() {
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (!hasBrowserAuthHint()) return;
        const response = await fetch("/api/auth/session", { headers: { accept: "application/json" }, cache: "no-store" });
        if (!response.ok || cancelled) return;
        const parsed = accountSessionResponseSchema.safeParse(await response.json());
        if (!parsed.success || cancelled) return;
        const choice = parsed.data.account.preferences.colorScheme;
        if (!isThemeChoice(choice) || localStorage.getItem(themeStorageKey) === choice) return;
        setThemeChoice(choice);
      } catch {
        return;
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
