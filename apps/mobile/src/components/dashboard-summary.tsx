import { View } from "react-native";
import type { DashboardCount } from "../catalogue/dashboard-counts";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppCard } from "./app-card";
import { AppText } from "./app-text";

export function DashboardSummary({ counts }: { counts: readonly DashboardCount[] }) {
  const { palette } = useTheme();
  return (
    <AppCard accessibilityLabel="IPO summary counts">
      <AppText weight="semibold">At a glance</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing[2] }}>
        {counts.map((count) => (
          <View
            key={count.id}
            accessible
            accessibilityLabel={`${count.label}: ${count.loading ? "loading" : count.value}`}
            style={{
              width: "47%",
              minWidth: 120,
              flexGrow: 1,
              gap: mobileTheme.spacing[1],
              padding: mobileTheme.spacing[3],
              borderRadius: mobileTheme.radius.md,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.background,
            }}
          >
            <AppText size="sm" tone="muted">
              {count.label}
            </AppText>
            <AppText weight="bold" size="lg">
              {count.loading ? "…" : count.value}
            </AppText>
          </View>
        ))}
      </View>
    </AppCard>
  );
}
