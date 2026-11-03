import type { ReactNode } from "react";
import { View } from "react-native";
import { mobileTheme } from "../theme/theme";
import { AppText } from "./app-text";

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ gap: mobileTheme.spacing[2] }}>
      {eyebrow ? (
        <AppText size="sm" weight="semibold" tone="positive">
          {eyebrow}
        </AppText>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: mobileTheme.spacing[3] }}>
        <AppText accessibilityRole="header" size="xl" weight="semibold" style={{ flex: 1 }}>
          {title}
        </AppText>
        {action}
      </View>
      {description ? <AppText tone="muted">{description}</AppText> : null}
    </View>
  );
}
