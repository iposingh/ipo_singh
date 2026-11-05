import { Pressable, View } from "react-native";
import { browseModeChoices, type BrowseMode } from "../catalogue/browse-mode";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";

/** Current & Upcoming | Listed segmented control for Mainboard and SME lists. */
export function BrowseModeSwitcher({
  mode,
  onChange,
}: {
  mode: BrowseMode;
  onChange: (mode: BrowseMode) => void;
}) {
  const { palette, colorScheme } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="IPO list mode"
      style={{
        flexDirection: "row",
        borderWidth: 1,
        borderColor: colorScheme === "dark" ? palette.borderSubtle : palette.border,
        borderRadius: mobileTheme.radius.md,
        overflow: "hidden",
        backgroundColor: palette.surfaceElevated,
      }}
    >
      {browseModeChoices.map((choice) => {
        const selected = mode === choice.id;
        return (
          <Pressable
            key={choice.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={choice.label}
            onPress={() => onChange(choice.id)}
            android_ripple={{ color: palette.border }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: mobileTheme.sizing.touchTarget,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: mobileTheme.spacing[2],
              backgroundColor: selected ? palette.primarySolid : "transparent",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <AppText
              weight="semibold"
              size="sm"
              numberOfLines={1}
              style={{ color: selected ? palette.primaryForeground : palette.foreground, textAlign: "center" }}
            >
              {choice.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
