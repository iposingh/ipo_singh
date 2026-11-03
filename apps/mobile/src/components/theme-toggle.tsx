import { useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, View } from "react-native";
import { themePatchForAccount } from "../account/preferences";
import { useAuth } from "../auth/provider";
import type { ThemeChoice } from "../theme/preference";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";

const options: readonly { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeToggle() {
  const { choice, colorScheme, palette, setTheme, storageNote } = useTheme();
  const { state, savePreferences } = useAuth();
  const [pending, setPending] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const nextScheme = colorScheme === "dark" ? "light" : "dark";

  function choose(next: ThemeChoice) {
    if (pending) return;
    const previous = choice;
    const patch = themePatchForAccount(state.phase, next);
    setTheme(next);
    if (!patch) return;
    setPending(true);
    void savePreferences(patch).then((message) => {
      setPending(false);
      if (message) {
        setTheme(previous);
        setWarning(message);
        return;
      }
      setWarning(null);
    });
  }

  return (
    <View style={{ gap: mobileTheme.spacing[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing[2] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nextScheme === "dark" ? "Switch to dark theme" : "Switch to light theme"}
          onPress={() => choose(nextScheme)}
          android_ripple={{ color: palette.border }}
          style={({ pressed }) => ({
            minWidth: mobileTheme.sizing.iconButton,
            minHeight: mobileTheme.sizing.iconButton,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: mobileTheme.radius.md,
            backgroundColor: palette.surface,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name={colorScheme === "dark" ? "sunny" : "moon"} size={20} color={palette.foreground} importantForAccessibility="no" accessibilityElementsHidden />
        </Pressable>
        <View accessibilityRole="radiogroup" accessibilityLabel="Color theme" style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing[2] }}>
          {options.map((option) => {
            const selected = choice === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: selected }}
                onPress={() => choose(option.value)}
                android_ripple={{ color: palette.border }}
                style={({ pressed }) => ({
                  minHeight: mobileTheme.sizing.touchTarget,
                  paddingHorizontal: mobileTheme.spacing[3],
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: selected ? palette.primarySolid : palette.border,
                  borderRadius: mobileTheme.radius.md,
                  backgroundColor: selected ? palette.primarySolid : palette.surface,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <AppText weight="medium" size="sm" style={{ color: selected ? palette.primaryForeground : palette.foreground }}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
      {storageNote ? (
        <AppText accessibilityLiveRegion="polite" tone="warning" size="sm">
          {storageNote}
        </AppText>
      ) : null}
      {warning ? (
        <AppText accessibilityLiveRegion="polite" tone="warning" size="sm">
          {warning}
        </AppText>
      ) : null}
    </View>
  );
}
