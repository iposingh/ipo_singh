import { ActivityIndicator, Pressable } from "react-native";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { primaryButtonSurfaceStyle } from "../theme/surfaces";
import { AppText } from "./app-text";

export function PrimaryButton({ label, onPress, loading = false, disabled = false }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  const { palette, colorScheme } = useTheme();
  const inactive = disabled || loading;
  const color = disabled ? palette.disabledForeground : palette.primaryForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading ? "Loading." : label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      android_ripple={{ color: palette.primarySolidActive }}
      style={({ pressed }) => ({
        alignSelf: "flex-start",
        maxWidth: 480,
        minHeight: mobileTheme.sizing.touchTarget,
        paddingHorizontal: mobileTheme.spacing[4],
        borderRadius: mobileTheme.radius.md,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: mobileTheme.spacing[2],
        ...(disabled
          ? { backgroundColor: palette.disabled, elevation: 0, shadowOpacity: 0 }
          : primaryButtonSurfaceStyle(palette, colorScheme, pressed && !inactive)),
      })}
    >
      {loading ? <ActivityIndicator color={color} /> : null}
      <AppText weight="semibold" maxFontSizeMultiplier={1.6} style={{ color }}>
        {loading ? "Loading." : label}
      </AppText>
    </Pressable>
  );
}
