import type { Board } from "@ipo-singh/contracts";
import { Pressable, View } from "react-native";
import { boardLabel } from "../design/copy";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";

const options: readonly Board[] = ["mainboard", "sme"];

export function BoardSwitcher({
  board,
  onChange,
}: {
  board: Board;
  onChange: (board: Board) => void;
}) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="IPO board"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing[2] }}
    >
      {options.map((option) => {
        const selected = board === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={boardLabel(option)}
            onPress={() => onChange(option)}
            android_ripple={{ color: palette.border }}
            style={({ pressed }) => ({
              minHeight: mobileTheme.sizing.touchTarget,
              minWidth: mobileTheme.sizing.touchTarget,
              paddingHorizontal: mobileTheme.spacing[4],
              alignItems: "center",
              justifyContent: "center",
              borderRadius: mobileTheme.radius.md,
              borderWidth: 1,
              borderColor: selected ? palette.primarySolid : palette.border,
              backgroundColor: selected ? palette.primarySolid : palette.surface,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <AppText weight="semibold" size="sm" style={{ color: selected ? palette.primaryForeground : palette.foreground }}>
              {boardLabel(option)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
