import { useState } from "react";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Linking, Pressable, View } from "react-native";
import { useAuth } from "../auth/provider";
import { AppText } from "../components/app-text";
import { EmptyState } from "../components/empty-state";
import { LoadingSkeleton } from "../components/loading-skeleton";
import { PrimaryButton } from "../components/primary-button";
import { ScreenContainer } from "../components/screen-container";
import { SectionHeader } from "../components/section-header";
import { ThemeToggle } from "../components/theme-toggle";
import { readAppEnvironment } from "../api/origin";
import { AnonymousAllotmentReminders } from "../notifications/push-reminders";
import {
  diagnosticsAvailable,
  diagnosticsRevealHint,
  diagnosticsSectionDescription,
  diagnosticsSectionTitle,
  nextDiagnosticsVisible,
} from "../settings/diagnostics";
import { appVersionLabel, developerContactEmail, developerMailto, legalPageUrl, legalPages, type LegalPageId } from "../settings/legal";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { ApiStatus } from "./api-status";
import { AccountPreferencesForm } from "./account-preferences";
import { AccountSignedIn } from "./account-signed-in";
import { AccountSignIn } from "./account-sign-in";

function SettingsRow({
  label,
  description,
  onPress,
  accessibilityHint,
}: {
  label: string;
  description?: string;
  onPress: () => void;
  accessibilityHint?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      android_ripple={{ color: palette.border }}
      style={({ pressed }) => ({
        minHeight: mobileTheme.sizing.touchTarget,
        justifyContent: "center",
        gap: mobileTheme.spacing[1],
        paddingVertical: mobileTheme.spacing[2],
        borderBottomWidth: 1,
        borderBottomColor: palette.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <AppText weight="medium">{label}</AppText>
      {description ? (
        <AppText size="sm" tone="muted">
          {description}
        </AppText>
      ) : null}
    </Pressable>
  );
}

export function SettingsScreen() {
  const { palette } = useTheme();
  const { state, logout, retry } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const appEnv = readAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV, __DEV__);
  const canOpenDiagnostics = diagnosticsAvailable(appEnv);
  const version = appVersionLabel(Constants.expoConfig?.version ?? "0.1.0", Constants.nativeBuildVersion);

  async function openLegal(id: LegalPageId) {
    const page = legalPages.find((item) => item.id === id);
    if (!page) return;
    if (id === "contact") {
      try {
        await Linking.openURL(developerMailto);
        setMessage(null);
      } catch {
        setMessage(`Email could not be opened. Write to ${developerContactEmail}.`);
      }
      return;
    }
    const url = legalPageUrl(id);
    if (url) {
      try {
        await Linking.openURL(url);
        setMessage(null);
        return;
      } catch {
        setMessage("The website page could not be opened. The summary below still matches the published site.");
      }
    } else {
      setMessage("The public website address is not set for this build. Showing the published summary instead.");
    }
  }

  return (
    <ScreenContainer keyboardDismissMode="on-drag" safeBottom>
      <SectionHeader title="Settings" description="Appearance, alerts, account, and legal pages. Public IPO browsing does not require sign-in." />

      <SectionHeader
        title="Appearance"
        description={
          state.phase === "ready"
            ? "Light, Dark, or System. A signed-in choice is saved on the account and on this device."
            : "Light, Dark, or System. The choice is saved on this device for guests."
        }
      />
      <ThemeToggle />

      <SectionHeader title="Notifications" description="Category preferences need an account. Global allotment phone reminders do not require a watchlisted IPO. Email is not sent." />
      {state.phase === "ready" ? <AccountPreferencesForm /> : null}
      {state.phase === "signed-out" || state.phase === "offline" ? <AnonymousAllotmentReminders /> : null}
      {state.phase === "signed-out" ? (
        <AppText size="sm" tone="muted">
          Sign in below to manage opening, closing, allotment results, and listing reminder categories.
        </AppText>
      ) : null}

      <SectionHeader title="Account" description="Optional. Guests can keep browsing Home and IPOs without signing in." />
      {state.phase === "loading" ? <LoadingSkeleton label="Loading the account" /> : null}
      {state.phase === "offline" ? (
        <View style={{ gap: mobileTheme.spacing[3] }}>
          <EmptyState title="The account could not be loaded." description={state.notice} />
          <PrimaryButton label="Try again" onPress={() => void retry()} />
          <PrimaryButton label="Sign out on this device" onPress={() => void logout(false)} />
        </View>
      ) : null}
      {state.phase === "signed-out" ? (
        <View style={{ gap: mobileTheme.spacing[3] }}>
          {state.notice ? (
            <AppText size="sm" tone="warning">
              {state.notice}
            </AppText>
          ) : null}
          <AccountSignIn />
        </View>
      ) : null}
      {state.phase === "ready" ? <AccountSignedIn /> : null}

      <SectionHeader title="Learn" description="Published IPO guides and updates from IPO Singh. Empty when nothing is published." />
      <SettingsRow
        label="News & Guides"
        description="Educational articles and IPO updates. No invented market news."
        accessibilityHint="Opens published articles"
        onPress={() => router.push("/news")}
      />

      <SectionHeader title="Legal & about" description="Privacy and Terms open the IPO Singh website when the public site address is configured." />
      <View style={{ gap: mobileTheme.spacing[1] }}>
        {legalPages.map((page) => (
          <SettingsRow
            key={page.id}
            label={page.label}
            description={page.summary}
            accessibilityHint={page.id === "contact" ? "Opens email" : "Opens the website page when available"}
            onPress={() => {
              void openLegal(page.id);
            }}
          />
        ))}
      </View>
      {message ? (
        <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      ) : null}

      <View style={{ gap: mobileTheme.spacing[1], paddingTop: mobileTheme.spacing[2] }}>
        <AppText size="sm" tone="muted">
          App version
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="App version"
          accessibilityHint={canOpenDiagnostics ? diagnosticsRevealHint : undefined}
          onLongPress={
            canOpenDiagnostics ? () => setDiagnosticsOpen((open) => nextDiagnosticsVisible(open)) : undefined
          }
          delayLongPress={600}
          style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
        >
          <AppText weight="medium">{version}</AppText>
        </Pressable>
        <AppText size="sm" tone="muted" style={{ color: palette.muted }}>
          IPO Singh does not sell subscriptions or process payments in this app. Figures are informational; GMP is
          unofficial and indicative and is not investment advice.
        </AppText>
      </View>

      {canOpenDiagnostics && diagnosticsOpen ? (
        <View style={{ gap: mobileTheme.spacing[3], paddingTop: mobileTheme.spacing[4] }}>
          <SectionHeader title={diagnosticsSectionTitle()} description={diagnosticsSectionDescription()} />
          <ApiStatus />
          <PrimaryButton label="Hide diagnostics" onPress={() => setDiagnosticsOpen(nextDiagnosticsVisible(true, false))} />
        </View>
      ) : null}
    </ScreenContainer>
  );
}
