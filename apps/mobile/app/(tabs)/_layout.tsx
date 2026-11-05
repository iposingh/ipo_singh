import type { ComponentProps } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { AppHeader } from "../../src/components/app-header";
import { primaryTabs, type PrimaryTab } from "../../src/design/tabs";
import { useTheme } from "../../src/theme/provider";
import { mobileTheme } from "../../src/theme/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

const icons: Record<PrimaryTab["icon"], { active: IconName; inactive: IconName }> = {
  list: { active: "list", inactive: "list-outline" },
  calendar: { active: "calendar", inactive: "calendar-outline" },
  notifications: { active: "notifications", inactive: "notifications-outline" },
  settings: { active: "settings", inactive: "settings-outline" },
};

export default function TabLayout() {
  const { palette, colorScheme } = useTheme();
  return (
    <Tabs
      screenOptions={{
        header: ({ options }) => <AppHeader title={options.title ?? "IPO Singh"} />,
        headerShadowVisible: false,
        tabBarActiveTintColor: palette.primarySolid,
        tabBarInactiveTintColor: palette.muted,
        tabBarAllowFontScaling: true,
        tabBarStyle: {
          backgroundColor: palette.surfaceElevated,
          borderTopColor: colorScheme === "dark" ? palette.borderSubtle : palette.border,
          minHeight: mobileTheme.sizing.touchTarget + mobileTheme.spacing[2],
        },
        tabBarItemStyle: { minHeight: mobileTheme.sizing.touchTarget },
        tabBarLabelStyle: { fontSize: mobileTheme.fontSize.xs, fontWeight: mobileTheme.fontWeight.medium },
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: palette.background },
      }}
    >
      {primaryTabs.map((tab) => (
        <Tabs.Screen
          key={tab.route}
          name={tab.route}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.accessibilityLabel,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? icons[tab.icon].active : icons[tab.icon].inactive}
                size={22}
                color={typeof color === "string" ? color : focused ? palette.primarySolid : palette.muted}
                importantForAccessibility="no"
                accessibilityElementsHidden
              />
            ),
          }}
        />
      ))}
      {/* Legacy routes kept for deep links / house banners; hidden from the tab bar. */}
      <Tabs.Screen name="ipos" options={{ href: null, title: "Search IPOs" }} />
      <Tabs.Screen name="watchlist" options={{ href: null, title: "Watchlist" }} />
      <Tabs.Screen name="account" options={{ href: null, title: "Account" }} />
    </Tabs>
  );
}
