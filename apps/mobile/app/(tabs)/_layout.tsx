import type { ComponentProps } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { AppHeader } from "../../src/components/app-header";
import { primaryTabs, type PrimaryTab } from "../../src/design/tabs";
import { useTheme } from "../../src/theme/provider";
import { mobileTheme } from "../../src/theme/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

const icons: Record<PrimaryTab["icon"], { active: IconName; inactive: IconName }> = {
  home: { active: "home", inactive: "home-outline" },
  list: { active: "list", inactive: "list-outline" },
  bookmark: { active: "bookmark", inactive: "bookmark-outline" },
  notifications: { active: "notifications", inactive: "notifications-outline" },
  settings: { active: "settings", inactive: "settings-outline" },
};

export default function TabLayout() {
  const { palette } = useTheme();
  return (
    <Tabs
      screenOptions={{
        header: ({ options }) => <AppHeader title={options.title ?? "IPO Singh"} />,
        headerShadowVisible: false,
        tabBarActiveTintColor: palette.primarySolid,
        tabBarInactiveTintColor: palette.muted,
        tabBarAllowFontScaling: true,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
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
      <Tabs.Screen name="sme" options={{ href: null, title: "SME IPOs" }} />
      <Tabs.Screen name="calendar" options={{ href: null, title: "Calendar" }} />
      <Tabs.Screen name="account" options={{ href: null, title: "Account" }} />
    </Tabs>
  );
}
