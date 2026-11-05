import type { ConfigContext, ExpoConfig } from "expo/config";

const background = "#F8FAFC";
const brandGreen = "#15803D";
const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
const isDevelopment = appEnv === "development";
const isProduction = appEnv === "production";

/**
 * Keep these literals aligned with `src/preview/identity.ts`.
 * Expo evaluates app.config without the TS path aliases used by the app bundle.
 */
const appDisplayName = "IPO Singh";
const appSlug = "ipo-singh";
const appUrlScheme = "iposigh";
const androidReminderChannelId = "ipo-reminders";
const developmentApplicationId = "com.iposigh.mobile.dev";
const productionApplicationId = "com.iposigh.mobile";
const applicationId = isProduction ? productionApplicationId : developmentApplicationId;
/** Keep aligned with `appVersionName` / `androidVersionCode` / `iosBuildNumber` in identity.ts. */
const appVersionName = "0.1.0";
const androidVersionCode = 1;
const iosBuildNumber = "1";
/** Pin Play-compatible API 36; must stay aligned with identity.ts android*SdkVersion constants. */
const androidMinSdkVersion = 24;
const androidCompileSdkVersion = 37;
const androidTargetSdkVersion = 36;
/** Keep aligned with `iosDeploymentTarget` in identity.ts (Expo SDK 58 baseline). */
const iosDeploymentTarget = "16.4";

/** Expo EAS project id for this app. Env may override; never invent a different project. */
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || "da0598c3-64c5-4fc6-9bf5-7fb2c0df8741";

export default function appConfig(_context: ConfigContext): ExpoConfig {
  return {
    name: appDisplayName,
    slug: appSlug,
    scheme: appUrlScheme,
    version: appVersionName,
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    primaryColor: brandGreen,
    runtimeVersion: {
      /** Native binary compatibility key. JS-only OTA updates must keep the same app version. */
      policy: "appVersion",
    },
    updates: {
      url: `https://u.expo.dev/${easProjectId}`,
      /** Prefer the embedded bundle when offline or when the update check is slow. */
      fallbackToCacheTimeout: 0,
      checkAutomatically: "ON_LOAD",
    },
    ios: {
      bundleIdentifier: applicationId,
      buildNumber: iosBuildNumber,
      supportsTablet: true,
      infoPlist: {
        NSUserNotificationsUsageDescription:
          "IPO Singh sends optional IPO open, close, allotment, listing, and schedule reminders you choose to follow. Browsing IPO pages does not require this permission.",
        /** Standard HTTPS-only networking; confirm before App Store export-compliance answers change. */
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: applicationId,
      versionCode: androidVersionCode,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: background,
      },
      /** Prefer the in-app header back control over the predictive gesture while previewing. */
      predictiveBackGestureEnabled: false,
      permissions: ["POST_NOTIFICATIONS"],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: false,
          category: ["BROWSABLE", "DEFAULT"],
          data: [{ scheme: appUrlScheme }],
        },
      ],
    },
    plugins: [
      "expo-router",
      "expo-dev-client",
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: androidMinSdkVersion,
            compileSdkVersion: androidCompileSdkVersion,
            targetSdkVersion: androidTargetSdkVersion,
            /** HTTP to a LAN API is required for physical-device and emulator development only. */
            usesCleartextTraffic: isDevelopment,
          },
          ios: {
            deploymentTarget: iosDeploymentTarget,
          },
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          resizeMode: "contain",
          backgroundColor: background,
        },
      ],
      "expo-image",
      [
        "expo-secure-store",
        {
          configureAndroidBackup: false,
          faceIDPermission: "IPO Singh uses Face ID only when the device unlocks SecureStore secrets.",
        },
      ],
      [
        "expo-notifications",
        {
          color: brandGreen,
          defaultChannel: androidReminderChannelId,
          mode: isDevelopment ? "development" : "production",
        },
      ],
      "expo-updates",
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      appEnvironment: appEnv,
      applicationId,
      easProjectId,
      eas: {
        projectId: easProjectId,
      },
    },
  };
}
