import { useEffect, useState } from "react";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform, View } from "react-native";
import { useAuth } from "../auth/provider";
import { AppText } from "../components/app-text";
import { PrimaryButton } from "../components/primary-button";
import { SectionHeader } from "../components/section-header";
import { openPushExplanation, pushAvailability, pushSetupCopy, pushUnavailableMessage, readExpoProjectId, type PushPhase } from "../notifications/push";
import {
  enableAnonymousAllotmentReminders,
  enablePhoneReminders,
  readAnonymousAllotmentOptIn,
  readStoredPushPhase,
  revokeStoredPushToken,
  setAnonymousAllotmentAlerts,
} from "../notifications/push-native";
import { readCatalogueTarget } from "../screens/catalogue-target";
import { mobileTheme } from "../theme/theme";

export function PushReminders() {
  const { state, call } = useAuth();
  const [phase, setPhase] = useState<PushPhase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const availability = pushAvailability({
    projectId: readExpoProjectId(Constants.expoConfig?.extra),
    isDevice: Device.isDevice,
    platform: Platform.OS,
  });

  useEffect(() => {
    let active = true;
    void readStoredPushPhase().then((stored) => {
      if (active && stored) setPhase(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  if (state.phase !== "ready") return null;

  async function disable(): Promise<void> {
    try {
      await revokeStoredPushToken(call);
      setPhase("idle");
      setNotice("Phone reminders are off on this device. In-app notices still follow your category preferences.");
    } catch {
      setNotice("Phone reminders could not be turned off.");
    }
  }

  return (
    <View style={{ gap: mobileTheme.spacing[3] }}>
      <SectionHeader title="Phone reminders" description={pushSetupCopy} />
      {phase === "idle" ? (
        <PrimaryButton label="Turn on phone reminders" onPress={() => setPhase(openPushExplanation(phase))} />
      ) : null}
      {phase === "explaining" && availability === "ready" ? (
        <PrimaryButton label="Allow notifications" onPress={() => { void enablePhoneReminders(call).then(setPhase); }} />
      ) : null}
      {phase === "explaining" && availability !== "ready" ? <AppText>{pushUnavailableMessage(availability)}</AppText> : null}
      {phase === "denied" ? (
        <AppText>Notifications are off for IPO Singh in system settings. Permission is not requested again from this screen. In-app notices still appear in this list.</AppText>
      ) : null}
      {phase === "registered" ? (
        <>
          <AppText>
            This phone is registered. Watchlist-based reminders follow your category preferences. Global allotment-out pushes do not require a saved IPO. Email is not used.
          </AppText>
          <PrimaryButton label="Turn off phone reminders" onPress={() => { void disable(); }} />
        </>
      ) : null}
      {phase === "unavailable" ? <AppText>{pushUnavailableMessage(availability)}</AppText> : null}
      {notice ? <AppText size="sm" tone="muted">{notice}</AppText> : null}
    </View>
  );
}

/** Unsigned-in allotment-out broadcasts only. No PAN or application numbers are collected. */
export function AnonymousAllotmentReminders() {
  const [phase, setPhase] = useState<PushPhase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const availability = pushAvailability({
    projectId: readExpoProjectId(Constants.expoConfig?.extra),
    isDevice: Device.isDevice,
    platform: Platform.OS,
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      const optedIn = await readAnonymousAllotmentOptIn();
      const stored = await readStoredPushPhase();
      if (!active) return;
      if (optedIn && stored === "registered") setPhase("registered");
      else if (stored === "denied" && optedIn) setPhase("denied");
    })();
    return () => {
      active = false;
    };
  }, []);

  async function enable(): Promise<void> {
    const target = await readCatalogueTarget();
    if ("error" in target || target.offline) {
      setPhase("unavailable");
      setNotice("Allotment phone reminders need a network connection.");
      return;
    }
    setPhase(await enableAnonymousAllotmentReminders(target.origin));
  }

  async function disable(): Promise<void> {
    const target = await readCatalogueTarget();
    if ("error" in target || target.offline) {
      setNotice("Allotment phone reminders could not be changed while offline.");
      return;
    }
    const ok = await setAnonymousAllotmentAlerts(target.origin, false);
    setNotice(ok ? "Allotment phone reminders are off for this installation." : "Allotment phone reminders could not be changed.");
    if (ok) setPhase("idle");
  }

  return (
    <View style={{ gap: mobileTheme.spacing[3] }}>
      <SectionHeader
        title="Allotment phone reminders"
        description="Without signing in, this phone can still receive a global allotment-out reminder. A watchlisted IPO is not required. PAN and application numbers are never requested. Email is not used."
      />
      {phase === "idle" ? (
        <PrimaryButton label="Turn on allotment reminders" onPress={() => setPhase(openPushExplanation(phase))} />
      ) : null}
      {phase === "explaining" && availability === "ready" ? (
        <PrimaryButton label="Allow allotment notifications" onPress={() => { void enable(); }} />
      ) : null}
      {phase === "explaining" && availability !== "ready" ? <AppText>{pushUnavailableMessage(availability)}</AppText> : null}
      {phase === "denied" ? (
        <AppText>Notifications are off for IPO Singh in system settings. Permission is not requested again from this screen.</AppText>
      ) : null}
      {phase === "registered" ? (
        <>
          <AppText>This installation is registered for allotment-out reminders. Sign in for the full in-app notification list and other reminder categories.</AppText>
          <PrimaryButton label="Turn off allotment reminders" onPress={() => { void disable(); }} />
        </>
      ) : null}
      {phase === "unavailable" ? <AppText>{notice ?? pushUnavailableMessage(availability)}</AppText> : null}
      {notice && phase !== "unavailable" ? <AppText>{notice}</AppText> : null}
    </View>
  );
}
