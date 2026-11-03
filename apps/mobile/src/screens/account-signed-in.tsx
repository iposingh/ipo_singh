import { useState } from "react";
import type { PublicSession } from "@ipo-singh/contracts";
import { accountPasswordIssue } from "@ipo-singh/contracts";
import { formatIstDateTime } from "@ipo-singh/core";
import { Alert, View } from "react-native";
import { useAuth } from "../auth/provider";
import { AppText } from "../components/app-text";
import { PrimaryButton } from "../components/primary-button";
import { TextField } from "../components/text-field";
import { mobileTheme } from "../theme/theme";

function clientLabel(client: PublicSession["client"]): string {
  if (client === "ios") return "iOS";
  if (client === "android") return "Android";
  return "Web";
}

export function AccountSignedIn() {
  const { state, saveDisplayName, changePassword, revoke, logout, deleteAccount } = useAuth();
  const snapshot = state.phase === "ready" ? state.snapshot : null;
  const [displayName, setDisplayName] = useState(snapshot?.account.displayName ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!snapshot) return null;
  const shown = message ?? (state.phase === "ready" ? state.notice : null);
  const passwordIssue = newPassword.length > 0 ? accountPasswordIssue(newPassword, snapshot.account.email ?? undefined) : null;

  function confirmDeleteAccount() {
    if (!deletePassword || busy) return;
    Alert.alert(
      "Close account?",
      "This closes your IPO Singh account, removes your watchlist, and signs out every device. Public IPO browsing still works without an account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close account",
          style: "destructive",
          onPress: () => {
            void run(async () => {
              const result = await deleteAccount({ password: deletePassword });
              if (!result) setDeletePassword("");
              return result;
            });
          },
        },
      ],
    );
  }

  async function run(work: () => Promise<string | null>, clearPasswords = false) {
    if (busy) return;
    setBusy(true);
    const result = await work();
    setBusy(false);
    setMessage(result);
    if (!result && clearPasswords) {
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  return (
    <View style={{ gap: mobileTheme.spacing[4] }}>
      <View style={{ gap: mobileTheme.spacing[2] }}>
        <AppText weight="semibold">{snapshot.account.email ?? "Email unavailable"}</AppText>
        <TextField label="Display name" value={displayName} onChangeText={setDisplayName} autoComplete="name" maxLength={80} />
        <PrimaryButton label="Save name" loading={busy} onPress={() => void run(() => saveDisplayName(displayName.trim() || null))} />
      </View>
      <View style={{ gap: mobileTheme.spacing[3] }}>
        <AppText weight="semibold">Sessions</AppText>
        {snapshot.sessions.map((session) => (
          <View key={session.id} style={{ gap: mobileTheme.spacing[1] }}>
            <AppText>{clientLabel(session.client)}{session.current ? " · This device" : ""}</AppText>
            <AppText size="sm" tone="muted">Started {formatIstDateTime(new Date(session.createdAt))}</AppText>
            {session.current ? null : (
              <PrimaryButton label="End session" disabled={busy} onPress={() => void run(() => revoke(session.id))} />
            )}
          </View>
        ))}
      </View>
      <View style={{ gap: mobileTheme.spacing[2] }}>
        <AppText weight="semibold">Password</AppText>
        <AppText size="sm" tone="muted">A new password signs out the other sessions. This device stays signed in.</AppText>
        <TextField label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="password" />
        <TextField label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="password" />
        {passwordIssue ? <AppText size="sm" tone="warning">{passwordIssue}</AppText> : null}
        <PrimaryButton
          label="Change password"
          loading={busy}
          disabled={Boolean(passwordIssue) || currentPassword.length === 0 || newPassword.length === 0}
          onPress={() => void run(() => changePassword({ currentPassword, newPassword }), true)}
        />
      </View>
      {shown ? <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">{shown}</AppText> : null}
      <PrimaryButton label="Sign out" disabled={busy} onPress={() => void logout(false)} />
      <PrimaryButton label="Sign out every device" disabled={busy} onPress={() => void logout(true)} />
      <View style={{ gap: mobileTheme.spacing[2] }}>
        <AppText weight="semibold">Close account</AppText>
        <AppText size="sm" tone="muted">
          Permanently closes this account and removes your watchlist and notification tokens. Enter your password, then
          confirm. You can still browse IPO pages as a guest.
        </AppText>
        <TextField
          label="Password to close account"
          value={deletePassword}
          onChangeText={setDeletePassword}
          secureTextEntry
          autoComplete="password"
        />
        <PrimaryButton label="Close account" disabled={busy || deletePassword.length === 0} onPress={confirmDeleteAccount} />
      </View>
    </View>
  );
}
