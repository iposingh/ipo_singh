import { formatIstDateTime } from "@ipo-singh/core";
import { Linking, Pressable, View } from "react-native";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";

/** Visible source credit for screens that show IPO Guru data. */
export function SourceAttribution({ retrievedAt }: { retrievedAt: string | null }) {
  const { palette } = useTheme();
  const date = retrievedAt ? new Date(retrievedAt) : null;
  const stamp = date && !Number.isNaN(date.getTime()) ? formatIstDateTime(date) : null;
  return (
    <View style={{ gap: mobileTheme.spacing[1], paddingTop: mobileTheme.spacing[4] }}>
      <Pressable accessibilityRole="link" accessibilityLabel="Data by IPO Guru" onPress={() => { void Linking.openURL("https://ipoguru.in"); }}>
        <AppText weight="semibold" style={{ color: palette.foreground, textDecorationLine: "underline" }}>
          Data by IPO Guru
        </AppText>
      </Pressable>
      <AppText size="sm" tone="muted">
        {stamp && stamp !== "Unavailable" ? `Updated ${stamp}` : "Source update time unavailable"}
      </AppText>
    </View>
  );
}
