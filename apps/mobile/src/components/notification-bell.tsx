import { router } from "expo-router";
import { Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { useNotifications } from "../notifications/provider";
import { AppText } from "./app-text";

export function NotificationBell() {
  const { palette } = useTheme();
  const { unreadCount } = useNotifications();
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";
  const badge = unreadCount > 99 ? "99+" : String(unreadCount);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push("/notifications")}
      android_ripple={{ color: palette.border }}
      style={({ pressed }) => ({
        minWidth: mobileTheme.sizing.touchTarget,
        minHeight: mobileTheme.sizing.touchTarget,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={unreadCount > 0 ? "notifications" : "notifications-outline"} size={22} color={palette.foreground} importantForAccessibility="no" accessibilityElementsHidden />
      {unreadCount > 0 ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={{
            position: "absolute",
            top: 4,
            right: 2,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: mobileTheme.radius.full,
            backgroundColor: palette.primarySolid,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText size="xs" weight="semibold" style={{ color: palette.primaryForeground }}>{badge}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
