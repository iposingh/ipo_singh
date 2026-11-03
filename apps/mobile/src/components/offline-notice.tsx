import { View } from "react-native";
import { apiFailureMessage } from "../api/errors";
import { useNetwork } from "../network/provider";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppCard } from "./app-card";
import { AppText } from "./app-text";
import { PrimaryButton } from "./primary-button";

export function OfflineNotice({
  message = apiFailureMessage.offline,
  onRetry,
  detail = "Saved IPO lists and issue pages may still appear. GMP, subscription, and allotment figures may not be current.",
}: {
  message?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <AppCard accessibilityRole="alert" accessibilityLiveRegion="polite" accessibilityLabel="Offline">
      <AppText size="sm" weight="semibold" tone="warning">
        Offline
      </AppText>
      <AppText weight="semibold">{message}</AppText>
      <AppText tone="muted">{detail}</AppText>
      {onRetry ? <PrimaryButton label="Try again" onPress={onRetry} /> : null}
    </AppCard>
  );
}

export function NetworkRetryNotice({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <AppCard accessibilityRole="alert" accessibilityLiveRegion="polite">
      <AppText size="sm" weight="semibold" tone="negative">
        Connection
      </AppText>
      <AppText weight="semibold">{title}</AppText>
      <AppText tone="muted">{message}</AppText>
      <PrimaryButton label="Try again" onPress={onRetry} />
    </AppCard>
  );
}

/** Compact strip under the app header when the device reports no connectivity. */
export function OfflineBanner() {
  const { offline, ready } = useNetwork();
  const { palette } = useTheme();
  if (!ready || !offline) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel="Offline. Showing saved data where available."
      style={{
        paddingHorizontal: mobileTheme.spacing[3],
        paddingVertical: mobileTheme.spacing[2],
        backgroundColor: palette.surface,
        borderBottomWidth: 1,
        borderBottomColor: palette.warning,
      }}
    >
      <AppText size="sm" weight="semibold" tone="warning">
        Offline
      </AppText>
      <AppText size="sm" tone="muted">
        Showing saved IPO data where available. Figures may not be current.
      </AppText>
    </View>
  );
}
