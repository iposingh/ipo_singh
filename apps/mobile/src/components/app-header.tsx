import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useNavigation } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";
import { NotificationBell } from "./notification-bell";
import { OfflineBanner } from "./offline-notice";

export function AppHeader({ title, showSearch = true, showBell = true }: { title: string; showSearch?: boolean; showBell?: boolean }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const showBack = navigation.canGoBack();

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: palette.surface,
        borderBottomWidth: 1,
        borderBottomColor: palette.border,
      }}
    >
      <View style={{ minHeight: mobileTheme.sizing.touchTarget + mobileTheme.spacing[2], flexDirection: "row", alignItems: "center", paddingHorizontal: mobileTheme.spacing[2] }}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            android_ripple={{ color: palette.border }}
            style={({ pressed }) => ({
              minWidth: mobileTheme.sizing.touchTarget,
              minHeight: mobileTheme.sizing.touchTarget,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={22} color={palette.foreground} />
          </Pressable>
        ) : (
          <View style={{ width: mobileTheme.spacing[2] }} />
        )}
        <AppText accessibilityRole="header" weight="semibold" size="lg" style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </AppText>
        {showBell ? <NotificationBell /> : null}
        {showSearch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search IPOs"
            onPress={() => router.push("/(tabs)/ipos")}
            android_ripple={{ color: palette.border }}
            style={({ pressed }) => ({
              minWidth: mobileTheme.sizing.touchTarget,
              minHeight: mobileTheme.sizing.touchTarget,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="search" size={22} color={palette.foreground} importantForAccessibility="no" accessibilityElementsHidden />
          </Pressable>
        ) : showBell ? null : (
          <View style={{ width: mobileTheme.sizing.touchTarget }} />
        )}
      </View>
      <OfflineBanner />
    </View>
  );
}
