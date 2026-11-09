import { useState } from "react";
import Constants from "expo-constants";
import { Linking, Pressable, Share, View } from "react-native";
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
import {
  appVersionLabel,
  developerContactEmail,
  developerMailto,
  legalPageUrl,
  legalPages,
  shareWithFriendsMessage,
  shareWithFriendsUrl,
  type LegalPageId,
} from "../settings/legal";
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

function WelcomeAccountCard({
  signedIn,
  name,
  onOpenAuth,
  authOpen,
}: {
  signedIn: boolean;
  name: string | null;
  onOpenAuth: () => void;
  authOpen: boolean;
}) {
  const { palette } = useTheme();
  if (signedIn) {
    return (
      <View
        style={{
          gap: mobileTheme.spacing[1],
          padding: mobileTheme.spacing[4],
          borderRadius: mobileTheme.radius.lg,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.surface,
        }}
      >
        <AppText weight="semibold" size="lg">
          {name ?? "Signed in"}
        </AppText>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Welcome, User. Click here to sign in or create an account"
      accessibilityState={{ expanded: authOpen }}
      onPress={onOpenAuth}
      android_ripple={{ color: palette.border }}
      style={({ pressed }) => ({
        gap: mobileTheme.spacing[1],
        padding: mobileTheme.spacing[4],
        borderRadius: mobileTheme.radius.lg,
        borderWidth: 1,
        borderColor: palette.primarySolid,
        backgroundColor: palette.surface,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <AppText weight="semibold" size="lg">
        Welcome, User
      </AppText>
      <AppText size="sm" tone="muted">
        Click here to sign in or create an account
      </AppText>
    </Pressable>
  );
}

export function SettingsScreen() {
  const { palette } = useTheme();
  const { state, logout, retry } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const appEnv = readAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV, __DEV__);
  const canOpenDiagnostics = diagnosticsAvailable(appEnv);
  const version = appVersionLabel(Constants.expoConfig?.version ?? "0.1.0", Constants.nativeBuildVersion);
  const signedInName =
    state.phase === "ready"
      ? state.snapshot.account.displayName?.trim() || state.snapshot.account.email || "Signed in"
      : null;

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

  async function shareWithFriends() {
    try {
      await Share.share({ message: shareWithFriendsMessage, url: shareWithFriendsUrl });
      setMessage(null);
    } catch {
      setMessage("Sharing was cancelled or could not be completed.");
    }
  }

  return (
    <ScreenContainer keyboardDismissMode="on-drag" safeBottom>
      <SectionHeader title="Settings" />

      {/* FIRST — Welcome / Account */}
      <WelcomeAccountCard
        signedIn={state.phase === "ready"}
        name={signedInName}
        authOpen={authOpen}
        onOpenAuth={() => setAuthOpen((open) => !open)}
      />
      {state.phase === "loading" ? <LoadingSkeleton label="Loading the account" /> : null}
      {state.phase === "offline" ? (
        <View style={{ gap: mobileTheme.spacing[3] }}>
          <EmptyState title="The account could not be loaded." description={state.notice} />
          <PrimaryButton label="Try again" onPress={() => void retry()} />
          <PrimaryButton label="Sign out on this device" onPress={() => void logout(false)} />
        </View>
      ) : null}
      {state.phase === "signed-out" && (authOpen || state.notice) ? (
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

      {/* SECOND — Share with friends */}
      <SettingsRow
        label="Share with friends"
        description="Invite friends to explore IPO Singh at iposingh.com"
        accessibilityHint="Opens the system share sheet"
        onPress={() => {
          void shareWithFriends();
        }}
      />

      {/* Remaining options */}
      <SectionHeader title="Notification preferences" />
      {state.phase === "ready" ? <AccountPreferencesForm /> : null}
      {state.phase === "signed-out" || state.phase === "offline" ? <AnonymousAllotmentReminders /> : null}

      <SectionHeader title="Appearance" />
      <ThemeToggle />

      <SectionHeader title="Legal & about" />
      <View style={{ gap: mobileTheme.spacing[1] }}>
        {(["contact", "privacy", "terms", "about"] as const).map((id) => {
          const page = legalPages.find((item) => item.id === id);
          if (!page) return null;
          return (
            <SettingsRow
              key={page.id}
              label={page.label}
              description={page.summary}
              accessibilityHint={page.id === "contact" ? "Opens email" : "Opens the website page when available"}
              onPress={() => {
                void openLegal(page.id);
              }}
            />
          );
        })}
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
          onLongPress={canOpenDiagnostics ? () => setDiagnosticsOpen((open) => nextDiagnosticsVisible(open)) : undefined}
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
