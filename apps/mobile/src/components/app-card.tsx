import type { ReactNode } from "react";
import { View, type AccessibilityRole, type StyleProp, type ViewStyle } from "react-native";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";

type AppCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityRole?: AccessibilityRole;
  accessibilityLiveRegion?: "none" | "polite" | "assertive";
  accessibilityLabel?: string;
};

/** Surface container using Growth Arrow Green card tokens. Prefer this over ad-hoc bordered boxes. */
export function AppCard({ children, style, accessibilityRole, accessibilityLiveRegion, accessibilityLabel }: AppCardProps) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole={accessibilityRole}
      accessibilityLiveRegion={accessibilityLiveRegion}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          gap: mobileTheme.spacing[3],
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: palette.surface,
          padding: mobileTheme.spacing[4],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
