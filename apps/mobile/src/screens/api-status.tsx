import { useEffect, useState } from "react";
import * as Device from "expo-device";
import * as Network from "expo-network";
import { ActivityIndicator, View } from "react-native";
import { checkApiHealth, type StartupReport } from "../api/health";
import { apiFailureMessage } from "../api/errors";
import { readAppEnvironment } from "../api/origin";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "../components/app-text";
import { AppCard } from "../components/app-card";
import { PrimaryButton } from "../components/primary-button";

type StatusState = { phase: "checking" } | { phase: "report"; report: StartupReport };

function messageFor(report: StartupReport): string {
  if (report.status === "ready") return "The IPO Singh API responded.";
  if (report.status === "offline") return apiFailureMessage.offline;
  if (report.status === "configuration") return apiFailureMessage[report.failure];
  return report.message;
}

export function ApiStatus() {
  const { palette } = useTheme();
  const [state, setState] = useState<StatusState>({ phase: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const appEnv = readAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV, __DEV__);
    void (async () => {
      const network = await Network.getNetworkStateAsync();
      if (controller.signal.aborted) return;
      const report = await checkApiHealth({
        appEnv,
        configuredOrigin: process.env.EXPO_PUBLIC_IPO_SINGH_API_ORIGIN,
        offline: network.isConnected === false,
        isPhysicalDevice: Device.isDevice,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setState({ phase: "report", report });
    })().catch(() => {
      if (!controller.signal.aborted) {
        setState({ phase: "report", report: { status: "unavailable", kind: "network", message: apiFailureMessage.network } });
      }
    });
    return () => controller.abort();
  }, [attempt]);

  const report = state.phase === "report" ? state.report : null;
  return (
    <AppCard accessibilityLiveRegion="polite">
      {state.phase === "checking" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing[3], minHeight: mobileTheme.sizing.touchTarget }}>
          <ActivityIndicator color={palette.primary} />
          <AppText>Checking the IPO Singh API</AppText>
        </View>
      ) : (
        <View style={{ gap: mobileTheme.spacing[2] }}>
          <AppText weight="semibold">{report ? messageFor(report) : ""}</AppText>
          {report?.status === "ready" ? (
            <AppText size="sm" tone="muted">
              {report.health.service} {report.health.version}
              {"\n"}
              {report.health.timestampIst}
              {"\n"}
              Asia/Kolkata
            </AppText>
          ) : null}
          {report?.status === "offline" ? <AppText size="sm" tone="muted">Cached IPO lists may still appear when available.</AppText> : null}
        </View>
      )}
      <PrimaryButton
        label="Check again"
        onPress={() => {
          setState({ phase: "checking" });
          setAttempt((value) => value + 1);
        }}
      />
    </AppCard>
  );
}
