import { Pressable } from "react-native";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { palette, colorScheme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: palette.border }}
      style={({ pressed }) => ({
        alignSelf: "flex-start",
        maxWidth: 480,
        minHeight: mobileTheme.sizing.touchTarget,
        minWidth: mobileTheme.sizing.touchTarget,
        paddingHorizontal: mobileTheme.spacing[4],
        borderRadius: mobileTheme.radius.md,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: disabled ? palette.disabled : colorScheme === "dark" ? palette.borderSubtle : palette.border,
        backgroundColor: pressed && !disabled ? palette.surfaceMuted : palette.surface,
        opacity: disabled ? 0.7 : 1,
      })}
    >
      <AppText weight="semibold" maxFontSizeMultiplier={1.6} style={{ color: disabled ? palette.disabledForeground : palette.foreground }}>
        {label}
      </AppText>
    </Pressable>
  );
}
