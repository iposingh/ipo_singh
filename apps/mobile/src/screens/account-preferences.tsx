import { useState } from "react";
import type { AccountPreferences } from "@ipo-singh/contracts";
import { Pressable, View } from "react-native";
import { notificationCategoryOptions } from "../account/preferences";
import { useAuth } from "../auth/provider";
import { AppText } from "../components/app-text";
import { FilterChips } from "../components/discovery-controls";
import { SectionHeader } from "../components/section-header";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";

type BoardChoice = "none" | "mainboard" | "sme";
type PushChoice = AccountPreferences["mobilePush"];

const boards: readonly { value: BoardChoice; label: string }[] = [
  { value: "none", label: "No default" },
  { value: "mainboard", label: "Mainboard" },
  { value: "sme", label: "SME" },
];

const pushOptions: readonly { value: PushChoice; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "when-available", label: "When available" },
];

export function AccountPreferencesForm() {
  const { state, savePreferences } = useAuth();
  const { palette } = useTheme();
  const [draft, setDraft] = useState<AccountPreferences | null>(null);
  const [pending, setPending] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  if (state.phase !== "ready") return null;
  const shown = draft ?? state.snapshot.account.preferences;

  async function commit(previous: AccountPreferences, next: AccountPreferences, patch: unknown) {
    if (pending) return;
    setDraft(next);
    setPending(true);
    const message = await savePreferences(patch);
    setPending(false);
    if (message) {
      setDraft(previous);
      setWarning(message);
      return;
    }
    setDraft(null);
    setWarning(null);
  }

  return (
    <View style={{ gap: mobileTheme.spacing[4] }}>
      <SectionHeader title="Preferences" description="These choices are stored on this account and follow it to the website. Email and SMS are not sent. Phone reminders also need this device to be registered. Mainboard alerts can reach opted-in devices without a watchlist. SME alerts require that IPO on your watchlist." />
      <FilterChips
        label="Default list"
        value={shown.defaultBoard ?? "none"}
        options={boards}
        onChange={(value) => {
          const next = { ...shown, defaultBoard: value === "none" ? null : value };
          void commit(shown, next, { defaultBoard: next.defaultBoard });
        }}
      />
      <AppText size="sm" tone="muted">Home stays Mainboard and the SME tab stays SME. The watchlist opens on this choice.</AppText>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="IPO alerts"
        accessibilityState={{ checked: shown.alertsEnabled, disabled: pending }}
        disabled={pending}
        onPress={() => {
          const next = { ...shown, alertsEnabled: !shown.alertsEnabled };
          void commit(shown, next, { alertsEnabled: next.alertsEnabled });
        }}
        style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
      >
        <AppText weight="medium">{shown.alertsEnabled ? "IPO alerts on" : "IPO alerts off"}</AppText>
      </Pressable>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Mainboard IPO alerts"
        accessibilityState={{ checked: shown.mainboardGlobalAlerts, disabled: pending }}
        disabled={pending}
        onPress={() => {
          const next = { ...shown, mainboardGlobalAlerts: !shown.mainboardGlobalAlerts };
          void commit(shown, next, { mainboardGlobalAlerts: next.mainboardGlobalAlerts });
        }}
        style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
      >
        <AppText weight="medium">{shown.mainboardGlobalAlerts ? "Mainboard alerts on" : "Mainboard alerts off"}</AppText>
      </Pressable>
      <AppText size="sm" tone="muted">Off by default. When on, eligible Mainboard reminders can arrive without adding that IPO to your watchlist.</AppText>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="SME watchlist alerts"
        accessibilityState={{ checked: shown.smeWatchlistAlerts, disabled: pending }}
        disabled={pending}
        onPress={() => {
          const next = { ...shown, smeWatchlistAlerts: !shown.smeWatchlistAlerts };
          void commit(shown, next, { smeWatchlistAlerts: next.smeWatchlistAlerts });
        }}
        style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
      >
        <AppText weight="medium">{shown.smeWatchlistAlerts ? "SME watchlist alerts on" : "SME watchlist alerts off"}</AppText>
      </Pressable>
      <AppText size="sm" tone="muted">SME reminders only fire for IPOs you save. Turning this off does not change Mainboard alerts.</AppText>
      <AppText size="sm" weight="medium">
        Core reminders
      </AppText>
      <View accessibilityRole="list" accessibilityLabel="Core notification categories" style={{ gap: mobileTheme.spacing[2] }}>
        {notificationCategoryOptions.filter((option) => option.primary).map((option) => {
          const checked = shown.notificationCategories[option.key];
          return (
            <Pressable
              key={option.key}
              accessibilityRole="switch"
              accessibilityLabel={option.label}
              accessibilityState={{ checked, disabled: pending }}
              disabled={pending}
              onPress={() => {
                const next = {
                  ...shown,
                  notificationCategories: { ...shown.notificationCategories, [option.key]: !checked },
                };
                void commit(shown, next, { notificationCategories: { [option.key]: !checked } });
              }}
              style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: palette.border }}
            >
              <AppText>{checked ? `${option.label} on` : `${option.label} off`}</AppText>
            </Pressable>
          );
        })}
      </View>
      <AppText size="sm" weight="medium">
        Additional categories
      </AppText>
      <View accessibilityRole="list" accessibilityLabel="Additional notification categories" style={{ gap: mobileTheme.spacing[2] }}>
        {notificationCategoryOptions.filter((option) => !option.primary).map((option) => {
          const checked = shown.notificationCategories[option.key];
          return (
            <Pressable
              key={option.key}
              accessibilityRole="switch"
              accessibilityLabel={option.label}
              accessibilityState={{ checked, disabled: pending }}
              disabled={pending}
              onPress={() => {
                const next = {
                  ...shown,
                  notificationCategories: { ...shown.notificationCategories, [option.key]: !checked },
                };
                void commit(shown, next, { notificationCategories: { [option.key]: !checked } });
              }}
              style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: palette.border }}
            >
              <AppText>{checked ? `${option.label} on` : `${option.label} off`}</AppText>
            </Pressable>
          );
        })}
      </View>
      <FilterChips
        label="Mobile push"
        value={shown.mobilePush}
        options={pushOptions}
        onChange={(value) => {
          const next = { ...shown, mobilePush: value };
          void commit(shown, next, { mobilePush: value });
        }}
      />
      <AppText size="sm" tone="muted">When available allows phone reminders after this phone is registered. Off sends nothing.</AppText>
      {warning ? <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">{warning}</AppText> : null}
    </View>
  );
}
