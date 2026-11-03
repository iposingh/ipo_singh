import { mobileSecureStoreKeys } from "@ipo-singh/contracts";
import { anonymousAllotmentEnabledKey, installationIdKey, pushTokenKey } from "../notifications/push.ts";

/** Public Expo env keys allowed in the mobile bundle. Provider and DB secrets must stay server-side. */
export const publicMobileEnvKeys = [
  "EXPO_PUBLIC_IPO_SINGH_API_ORIGIN",
  "EXPO_PUBLIC_IPO_SINGH_SITE_URL",
  "EXPO_PUBLIC_APP_ENV",
  "EXPO_PUBLIC_EAS_PROJECT_ID",
] as const;

/** Names that must never appear as EXPO_PUBLIC_* keys in the mobile app. */
export const forbiddenMobileSecretNames = [
  "IPO_GURU",
  "IPOGURU",
  "MONGODB",
  "MONGO_URI",
  "REDIS",
  "R2_",
  "AWS_SECRET",
  "OPS_TOKEN",
  "PASSWORD",
  "API_KEY",
] as const;

export function isForbiddenMobileEnvKey(key: string): boolean {
  const upper = key.toUpperCase();
  if (!upper.startsWith("EXPO_PUBLIC_")) return false;
  return forbiddenMobileSecretNames.some((name) => upper.includes(name));
}

/** SecureStore keys the app may use for auth or push. Catalogue cache stays in AsyncStorage. */
export const secureStoreKeyAllowlist = [
  mobileSecureStoreKeys.access,
  mobileSecureStoreKeys.refresh,
  pushTokenKey,
  installationIdKey,
  anonymousAllotmentEnabledKey,
] as const;

/**
 * Guest installation ids are random UUIDs created on device. They are not derived from
 * IMEI, advertising id, phone number, email, or PAN.
 */
export const installationIdPrivacyNote =
  "Installation ids are random UUIDs stored in SecureStore. They identify this install for push registration only and are not account credentials.";

export function allotmentCollectsSensitiveIdentity(): false {
  return false;
}
