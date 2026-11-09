import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { androidEmulatorApiOrigin, developmentApiOrigin } from "../api/origin.ts";
import { primaryTabTitles } from "../design/tabs.ts";
import {
  androidCompileSdkVersion,
  androidMinSdkVersion,
  androidReminderChannelId,
  androidTargetSdkVersion,
  androidVersionCode,
  appDisplayName,
  appUrlScheme,
  appVersionName,
  developmentApplicationId,
  iosBuildNumber,
  iosDeploymentTarget,
  productionApplicationId,
  productionIdentityMigration,
  proposedPackageRename,
} from "./identity.ts";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Expo Router paths exercised during preview smoke checks. */
export const previewRoutes = [
  "/",
  "/(tabs)/sme",
  "/(tabs)/calendar",
  "/(tabs)/notifications",
  "/(tabs)/settings",
  "/(tabs)/ipos",
  "/(tabs)/watchlist",
  "/search",
  "/compare",
  "/allotment",
  "/news",
  "/ipo/[slug]",
  "/news/[slug]",
] as const;

export const previewPrimaryTabs = ["Mainboard", "SME", "Calendar", "News", "Settings"] as const;

export type PreviewEnvironmentGuide = {
  appEnv: "development" | "preview" | "production";
  apiOriginHint: string;
  cleartextHttpAllowed: boolean;
  applicationId: string;
  notes: string[];
};

export function previewEnvironmentGuide(appEnv: PreviewEnvironmentGuide["appEnv"]): PreviewEnvironmentGuide {
  if (appEnv === "development") {
    return {
      appEnv,
      apiOriginHint: `${developmentApiOrigin} (simulator) · ${androidEmulatorApiOrigin} (Android emulator) · LAN http://<host-ip>:4000 (physical device)`,
      cleartextHttpAllowed: true,
      applicationId: developmentApplicationId,
      notes: [
        "Start the IPO Singh API on port 4000 before opening the app.",
        "Never set EXPO_PUBLIC_* to IPO Guru, MongoDB, Redis, or R2 secrets.",
        "A temporary Cloudflare tunnel may be used only for local physical-device smoke tests — never bake it into preview or production EAS env.",
        "Remote push needs a physical device, a development build, and the EAS project id.",
      ],
    };
  }
  if (appEnv === "preview") {
    return {
      appEnv,
      apiOriginHint: "https://<ipo-singh-staging-api-host> (required; local hosts and trycloudflare tunnels refused)",
      cleartextHttpAllowed: false,
      applicationId: developmentApplicationId,
      notes: [
        "Preview keeps package com.iposigh.mobile.dev so existing internal APKs can upgrade.",
        "Set EXPO_PUBLIC_IPO_SINGH_API_ORIGIN and EXPO_PUBLIC_IPO_SINGH_SITE_URL in the EAS preview environment, not in git.",
        "OTA channel is preview. Native module or identity changes still need a new APK/IPA.",
      ],
    };
  }
  return {
    appEnv,
    apiOriginHint: "https://<ipo-singh-production-api-host> (required; tunnels refused)",
    cleartextHttpAllowed: false,
    applicationId: productionApplicationId,
    notes: [
      productionIdentityMigration().summary,
      "Set EXPO_PUBLIC_IPO_SINGH_API_ORIGIN and EXPO_PUBLIC_IPO_SINGH_SITE_URL in the EAS production environment, not in git.",
      "OTA channel is production. Display name remains IPO Singh.",
    ],
  };
}

export function readMobilePackageJson(): {
  name: string;
  main: string;
  dependencies: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(mobileRoot, "package.json"), "utf8")) as {
    name: string;
    main: string;
    dependencies: Record<string, string>;
  };
}

export function readEasProfiles(): {
  developmentClient: boolean;
  profiles: string[];
  hasPreviewApk: boolean;
  hasProductionAab: boolean;
  hasSimulatorDevelopment: boolean;
  hasPhysicalIosDevelopment: boolean;
  hasIosPreviewDeviceBuild: boolean;
  hasIosStoreProduction: boolean;
  channels: Record<string, string | undefined>;
} {
  const eas = JSON.parse(readFileSync(join(mobileRoot, "eas.json"), "utf8")) as {
    build: Record<
      string,
      {
        developmentClient?: boolean;
        distribution?: string;
        channel?: string;
        android?: { buildType?: string };
        ios?: { simulator?: boolean };
      }
    >;
  };
  const profiles = Object.keys(eas.build);
  const development = eas.build.development;
  const developmentDevice = eas.build["development-device"];
  const preview = eas.build.preview;
  const production = eas.build.production;
  return {
    developmentClient: development?.developmentClient === true,
    profiles,
    hasPreviewApk: preview?.android?.buildType === "apk",
    hasProductionAab: production?.android?.buildType === "app-bundle",
    hasSimulatorDevelopment: development?.ios?.simulator === true,
    hasPhysicalIosDevelopment:
      developmentDevice?.developmentClient === true && developmentDevice.ios?.simulator === false,
    hasIosPreviewDeviceBuild: preview?.ios?.simulator === false && preview?.distribution === "internal",
    hasIosStoreProduction: production?.distribution === "store" && production.ios?.simulator === false,
    channels: Object.fromEntries(profiles.map((name) => [name, eas.build[name]?.channel])),
  };
}

export function readUpdatesConfig(): {
  hasExpoUpdatesDependency: boolean;
  runtimeVersionPolicy: string | null;
  updatesUrlConfigured: boolean;
} {
  const pkg = readMobilePackageJson();
  const configSource = readFileSync(join(mobileRoot, "app.config.ts"), "utf8");
  const runtimeMatch = configSource.match(/runtimeVersion:\s*\{[\s\S]*?policy:\s*"([^"]+)"/);
  return {
    hasExpoUpdatesDependency: typeof pkg.dependencies["expo-updates"] === "string",
    runtimeVersionPolicy: runtimeMatch?.[1] ?? null,
    updatesUrlConfigured: configSource.includes("https://u.expo.dev/"),
  };
}

export function previewNavigationContract(): {
  displayName: string;
  scheme: string;
  reminderChannelId: string;
  primaryTabs: string[];
  routes: readonly string[];
} {
  return {
    displayName: appDisplayName,
    scheme: appUrlScheme,
    reminderChannelId: androidReminderChannelId,
    primaryTabs: [...primaryTabTitles()],
    routes: previewRoutes,
  };
}

export function deepLinkExamples(slug = "fixture-mills"): { ipo: string; news: string; home: string } {
  return {
    home: `${appUrlScheme}://`,
    ipo: `${appUrlScheme}://ipo/${slug}`,
    news: `${appUrlScheme}://news/${slug}`,
  };
}

/** What requires a new native binary versus a JS OTA publish. */
export function nativeVersusOtaGuide(): { requiresNativeRebuild: string[]; otaEligible: string[] } {
  return {
    requiresNativeRebuild: [
      "Adding or upgrading native modules (for example expo-updates first enablement)",
      "Changing Android package / iOS bundle identifier",
      "Changing permissions, notification plugin mode, cleartext policy, or intent filters",
      "Changing the Expo SDK or React Native version",
      "Changing icons, splash, or other assets baked into the native project",
      "Changing android.versionCode, targetSdkVersion, or cleartext / signing-related native flags",
    ],
    otaEligible: [
      "TypeScript / React screen and business-logic changes that stay within the same runtimeVersion (appVersion)",
      "Copy, layout, and preference UI updates that do not need new native APIs",
      "Bug fixes that do not alter native configuration",
    ],
  };
}

/** Play / EAS versioning contract used by audits (local appVersionSource). */
export function androidVersioningContract(): {
  versionName: string;
  versionCode: number;
  appVersionSource: "local";
  minSdkVersion: number;
  compileSdkVersion: number;
  targetSdkVersion: number;
  productionPackageId: string;
  previewPackageId: string;
  productionBuildType: "app-bundle";
  previewBuildType: "apk";
  packageRenameStatus: "approval-required";
  notes: string[];
} {
  const rename = proposedPackageRename();
  return {
    versionName: appVersionName,
    versionCode: androidVersionCode,
    appVersionSource: "local",
    minSdkVersion: androidMinSdkVersion,
    compileSdkVersion: androidCompileSdkVersion,
    targetSdkVersion: androidTargetSdkVersion,
    productionPackageId: productionApplicationId,
    previewPackageId: developmentApplicationId,
    productionBuildType: "app-bundle",
    previewBuildType: "apk",
    packageRenameStatus: rename.status,
    notes: [
      "Bump versionName for user-visible releases; always increment versionCode for each Play upload of the same package.",
      "EAS cli.appVersionSource=local reads version and versionCode from app.config.ts — do not rely on remote auto-increment unless that policy is deliberately changed.",
      productionIdentityMigration().summary,
      rename.summary,
    ],
  };
}

/** App Store / TestFlight versioning contract (local appVersionSource). */
export function iosVersioningContract(): {
  versionName: string;
  buildNumber: string;
  deploymentTarget: string;
  appVersionSource: "local";
  productionBundleId: string;
  previewBundleId: string;
  packageRenameStatus: "approval-required";
  notes: string[];
} {
  const rename = proposedPackageRename();
  return {
    versionName: appVersionName,
    buildNumber: iosBuildNumber,
    deploymentTarget: iosDeploymentTarget,
    appVersionSource: "local",
    productionBundleId: productionApplicationId,
    previewBundleId: developmentApplicationId,
    packageRenameStatus: rename.status,
    notes: [
      "CFBundleShortVersionString is versionName; CFBundleVersion is buildNumber and must rise for every TestFlight/App Store upload of the same bundle id.",
      "Simulator development builds cannot be installed on a physical iPhone — use development-device, preview, or production/TestFlight profiles.",
      "APNs credentials are managed through Expo EAS for Expo push; do not embed .p8 keys in the app bundle.",
      productionIdentityMigration().summary,
      rename.summary,
    ],
  };
}

/** Declared Android permissions from app.config (dependency manifests may add more at prebuild). */
export function declaredAndroidPermissions(): readonly string[] {
  return ["POST_NOTIFICATIONS"];
}

/** Dependency-merged permissions expected on a release binary (informational). */
export function expectedMergedAndroidPermissions(): readonly string[] {
  return [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.RECEIVE_BOOT_COMPLETED",
  ];
}
