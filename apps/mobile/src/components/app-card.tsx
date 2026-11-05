import type { ReactNode } from "react";
import { View, type AccessibilityRole, type StyleProp, type ViewStyle } from "react-native";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { cardSurfaceStyle } from "../theme/surfaces";

type AppCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityRole?: AccessibilityRole;
  accessibilityLiveRegion?: "none" | "polite" | "assertive";
  accessibilityLabel?: string;
};

/** Surface container using premium card tokens. Prefer this over ad-hoc bordered boxes. */
export function AppCard({ children, style, accessibilityRole, accessibilityLiveRegion, accessibilityLabel }: AppCardProps) {
  const { palette, colorScheme } = useTheme();
  return (
    <View
      accessibilityRole={accessibilityRole}
      accessibilityLiveRegion={accessibilityLiveRegion}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          gap: mobileTheme.spacing[3],
          borderRadius: mobileTheme.radius.lg,
          padding: mobileTheme.spacing[4],
          ...cardSurfaceStyle(palette, colorScheme),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
