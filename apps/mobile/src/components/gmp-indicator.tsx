import { View } from "react-native";
import { gmpIndicatorCopy } from "../design/copy";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";

export function GMPIndicator({
  amountRupees,
  percent = null,
  freshness,
}: {
  amountRupees: number | null;
  percent?: number | null;
  freshness: "missing" | "fresh" | "stale";
}) {
  const { palette } = useTheme();
  const copy = gmpIndicatorCopy({ gmpAmountRupees: amountRupees, percent, freshness });
  const color = copy.tone === "positive" ? palette.positiveText : copy.tone === "negative" ? palette.negativeText : palette.muted;
  return (
    <View style={{ gap: mobileTheme.spacing[1] }}>
      <AppText>
        <AppText tone="muted">GMP </AppText>
        <AppText weight="semibold" style={{ color }}>
          {copy.value}
        </AppText>
      </AppText>
      {copy.freshness ? <AppText size="sm" tone={freshness === "stale" ? "warning" : "muted"}>{copy.freshness}</AppText> : null}
      {copy.disclaimer ? <AppText size="sm" tone="muted">{copy.disclaimer}</AppText> : null}
    </View>
  );
}
