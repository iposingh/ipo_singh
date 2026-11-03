import type { IpoStatus } from "@ipo-singh/contracts";
import { View } from "react-native";
import { listingLifecycleLabel, listingLifecycleTone, toneSymbol } from "../design/copy";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";

export function StatusBadge({
  status,
  allotmentConfirmed,
}: {
  status: IpoStatus | null;
  /** When set, Closed/Allotment use Awaited vs Out — never treat a date alone as Out. */
  allotmentConfirmed?: boolean | null;
}) {
  const { palette } = useTheme();
  const input = { status, allotmentConfirmed };
  const label = listingLifecycleLabel(input);
  const tone = listingLifecycleTone(input);
  if (!tone) {
    return <AppText tone="muted">{label}</AppText>;
  }
  const symbol = toneSymbol(tone);
  const color = tone === "positive" ? palette.positiveText : tone === "warning" ? palette.warningText : palette.foreground;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: mobileTheme.spacing[1],
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        borderRadius: mobileTheme.radius.full,
        paddingHorizontal: mobileTheme.spacing[2],
        paddingVertical: mobileTheme.spacing[1],
      }}
    >
      {symbol ? (
        <AppText size="xs" style={{ color }} accessibilityElementsHidden importantForAccessibility="no">
          {symbol}
        </AppText>
      ) : null}
      <AppText size="xs" weight="medium" style={{ color }}>
        {label}
      </AppText>
    </View>
  );
}
