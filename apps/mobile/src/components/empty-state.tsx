import type { ReactNode } from "react";
import { View } from "react-native";
import { mobileTheme } from "../theme/theme";
import { AppText } from "./app-text";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <View
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      style={{ gap: mobileTheme.spacing[2], minHeight: mobileTheme.sizing.touchTarget }}
    >
      <AppText weight="semibold">{title}</AppText>
      {description ? <AppText tone="muted">{description}</AppText> : null}
      {action}
    </View>
  );
}
