import { expoPushTokenSchema, pushTokenRegistrationSchema, devicePushPreferencesSchema } from "@ipo-singh/contracts";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { AndroidImportance, getExpoPushTokenAsync, getPermissionsAsync, requestPermissionsAsync, setNotificationChannelAsync } from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { z } from "zod";
import type { AuthSession } from "../auth/session.ts";
import { androidReminderChannelId } from "../preview/identity.ts";
import {
  anonymousAllotmentEnabledKey,
  devicePushPreferencesPath,
  devicePushTokenPath,
  installationIdKey,
  pushAvailability,
  pushTokenKey,
  pushTokenPath,
  readExpoProjectId,
  type PushPhase,
} from "./push.ts";

const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function ensureReminderChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await setNotificationChannelAsync(androidReminderChannelId, {
    name: "IPO reminders",
    importance: AndroidImportance.DEFAULT,
    description: "IPO open, close, allotment, listing, and schedule reminders you opt into.",
  });
}

/**
 * Random UUID for this install. Not derived from IMEI, advertising id, email, phone, or PAN.
 * Used only for anonymous push ownership and session device reuse.
 */
export async function readOrCreateInstallationId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(installationIdKey, secureOptions);
  if (existing && z.string().uuid().safeParse(existing).success) return existing;
  const created = crypto.randomUUID();
  await SecureStore.setItemAsync(installationIdKey, created, secureOptions);
  return created;
}

async function obtainExpoToken(): Promise<{ token: string; platform: "ios" | "android" } | PushPhase> {
  const projectId = readExpoProjectId(Constants.expoConfig?.extra);
  const availability = pushAvailability({ projectId, isDevice: Device.isDevice, platform: Platform.OS });
  if (availability !== "ready" || !projectId) return "unavailable";
  const current = await getPermissionsAsync();
  let status = current.status;
  if (status === "undetermined") {
    const asked = await requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== "granted") return "denied";
  await ensureReminderChannel();
  const platform = Platform.OS === "android" ? "android" : "ios";
  let token = "";
  try {
    token = (await getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return "unavailable";
  }
  if (!expoPushTokenSchema.safeParse(token).success) return "unavailable";
  return { token, platform };
}

export async function enablePhoneReminders(call: AuthSession["authorized"]): Promise<PushPhase> {
  const obtained = await obtainExpoToken();
  if (typeof obtained === "string") return obtained;
  await SecureStore.setItemAsync(pushTokenKey, obtained.token, secureOptions);
  const saved = await call({
    path: pushTokenPath,
    method: "POST",
    schema: pushTokenRegistrationSchema,
    body: { token: obtained.token, platform: obtained.platform },
  });
  if (saved.status !== "ready") {
    await SecureStore.deleteItemAsync(pushTokenKey, secureOptions);
    return "unavailable";
  }
  return "registered";
}

/**
 * Re-registers when Expo rotates the token. Does not request permission again.
 * Call only after the person has already opted in and permission is granted.
 */
export async function rotatePhoneRemindersIfNeeded(call: AuthSession["authorized"]): Promise<"rotated" | "unchanged" | "skipped" | PushPhase> {
  const stored = await SecureStore.getItemAsync(pushTokenKey, secureOptions);
  if (!stored || !expoPushTokenSchema.safeParse(stored).success) return "skipped";
  const projectId = readExpoProjectId(Constants.expoConfig?.extra);
  const availability = pushAvailability({ projectId, isDevice: Device.isDevice, platform: Platform.OS });
  if (availability !== "ready" || !projectId) return "skipped";
  const permission = await getPermissionsAsync();
  if (permission.status !== "granted") return "skipped";
  await ensureReminderChannel();
  let token = "";
  try {
    token = (await getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return "unavailable";
  }
  if (!expoPushTokenSchema.safeParse(token).success) return "unavailable";
  if (token === stored) return "unchanged";
  const platform = Platform.OS === "android" ? "android" : "ios";
  await SecureStore.setItemAsync(pushTokenKey, token, secureOptions);
  const saved = await call({
    path: pushTokenPath,
    method: "POST",
    schema: pushTokenRegistrationSchema,
    body: { token, platform },
  });
  if (saved.status !== "ready") {
    await SecureStore.setItemAsync(pushTokenKey, stored, secureOptions);
    return "unavailable";
  }
  return "rotated";
}

export async function readStoredPushPhase(): Promise<PushPhase | null> {
  const token = await SecureStore.getItemAsync(pushTokenKey, secureOptions);
  if (!token || !expoPushTokenSchema.safeParse(token).success) return null;
  const permission = await getPermissionsAsync();
  if (permission.status === "denied") return "denied";
  if (permission.status === "granted") return "registered";
  return null;
}

export async function readAnonymousAllotmentOptIn(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(anonymousAllotmentEnabledKey, secureOptions);
  return value === "1";
}

/**
 * Registers this installation for global allotment-out pushes without signing in.
 * Does not collect PAN or application numbers.
 */
export async function enableAnonymousAllotmentReminders(apiBaseUrl: string): Promise<PushPhase> {
  const obtained = await obtainExpoToken();
  if (typeof obtained === "string") return obtained;
  const installationId = await readOrCreateInstallationId();
  await SecureStore.setItemAsync(pushTokenKey, obtained.token, secureOptions);
  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${devicePushTokenPath}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        installationId,
        token: obtained.token,
        platform: obtained.platform,
        allotmentAlertsEnabled: true,
      }),
    });
    if (!response.ok) {
      await SecureStore.deleteItemAsync(pushTokenKey, secureOptions);
      return "unavailable";
    }
    const parsed = pushTokenRegistrationSchema.safeParse(await response.json());
    if (!parsed.success) {
      await SecureStore.deleteItemAsync(pushTokenKey, secureOptions);
      return "unavailable";
    }
    await SecureStore.setItemAsync(anonymousAllotmentEnabledKey, "1", secureOptions);
    return "registered";
  } catch {
    await SecureStore.deleteItemAsync(pushTokenKey, secureOptions);
    return "unavailable";
  }
}

/**
 * Rotates an anonymous allotment token when Expo issues a new one. Never re-prompts.
 */
export async function rotateAnonymousAllotmentIfNeeded(apiBaseUrl: string): Promise<"rotated" | "unchanged" | "skipped" | PushPhase> {
  const optedIn = await readAnonymousAllotmentOptIn();
  const stored = await SecureStore.getItemAsync(pushTokenKey, secureOptions);
  if (!optedIn || !stored || !expoPushTokenSchema.safeParse(stored).success) return "skipped";
  const projectId = readExpoProjectId(Constants.expoConfig?.extra);
  const availability = pushAvailability({ projectId, isDevice: Device.isDevice, platform: Platform.OS });
  if (availability !== "ready" || !projectId) return "skipped";
  const permission = await getPermissionsAsync();
  if (permission.status !== "granted") return "skipped";
  await ensureReminderChannel();
  let token = "";
  try {
    token = (await getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return "unavailable";
  }
  if (!expoPushTokenSchema.safeParse(token).success) return "unavailable";
  if (token === stored) return "unchanged";
  const installationId = await readOrCreateInstallationId();
  const platform = Platform.OS === "android" ? "android" : "ios";
  await SecureStore.setItemAsync(pushTokenKey, token, secureOptions);
  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${devicePushTokenPath}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ installationId, token, platform, allotmentAlertsEnabled: true }),
    });
    if (!response.ok || !pushTokenRegistrationSchema.safeParse(await response.json()).success) {
      await SecureStore.setItemAsync(pushTokenKey, stored, secureOptions);
      return "unavailable";
    }
    return "rotated";
  } catch {
    await SecureStore.setItemAsync(pushTokenKey, stored, secureOptions);
    return "unavailable";
  }
}

export async function setAnonymousAllotmentAlerts(apiBaseUrl: string, allotmentAlertsEnabled: boolean): Promise<boolean> {
  const installationId = await readOrCreateInstallationId();
  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${devicePushPreferencesPath}`, {
      method: "PATCH",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ installationId, allotmentAlertsEnabled }),
    });
    if (!response.ok) return false;
    const ok = devicePushPreferencesSchema.safeParse(await response.json()).success;
    if (ok) {
      if (allotmentAlertsEnabled) await SecureStore.setItemAsync(anonymousAllotmentEnabledKey, "1", secureOptions);
      else await SecureStore.deleteItemAsync(anonymousAllotmentEnabledKey, secureOptions);
    }
    return ok;
  } catch {
    return false;
  }
}

/**
 * After sign-in, move an anonymous allotment token onto the account so the same Expo
 * token is not owned by both anon:{installationId} and the user. No-op when the guest
 * never opted in.
 */
export async function claimAnonymousPushForAccount(call: AuthSession["authorized"]): Promise<"claimed" | "skipped" | "unavailable"> {
  const optedIn = await readAnonymousAllotmentOptIn();
  const token = await SecureStore.getItemAsync(pushTokenKey, secureOptions);
  if (!optedIn || !token || !expoPushTokenSchema.safeParse(token).success) return "skipped";
  const platform = Platform.OS === "android" ? "android" : "ios";
  const saved = await call({
    path: pushTokenPath,
    method: "POST",
    schema: pushTokenRegistrationSchema,
    body: { token, platform },
  });
  if (saved.status !== "ready") return "unavailable";
  await SecureStore.deleteItemAsync(anonymousAllotmentEnabledKey, secureOptions);
  return "claimed";
}

export async function revokeStoredPushToken(call: AuthSession["authorized"]): Promise<void> {
  const token = await SecureStore.getItemAsync(pushTokenKey, secureOptions);
  if (token && expoPushTokenSchema.safeParse(token).success) {
    await call({ path: pushTokenPath, method: "DELETE", schema: z.null(), body: { token } });
  }
  await SecureStore.deleteItemAsync(pushTokenKey, secureOptions);
}

export async function revokeAnonymousPushToken(apiBaseUrl: string): Promise<void> {
  const token = await SecureStore.getItemAsync(pushTokenKey, secureOptions);
  const installationId = await SecureStore.getItemAsync(installationIdKey, secureOptions);
  if (token && installationId && expoPushTokenSchema.safeParse(token).success) {
    try {
      await fetch(`${apiBaseUrl.replace(/\/$/, "")}${devicePushTokenPath}`, {
        method: "DELETE",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ installationId, token }),
      });
    } catch {
      // Best-effort revoke when signed out.
    }
  }
  await SecureStore.deleteItemAsync(pushTokenKey, secureOptions);
  await SecureStore.deleteItemAsync(anonymousAllotmentEnabledKey, secureOptions);
}
