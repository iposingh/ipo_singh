import type { AppEnvironment } from "../api/origin.ts";

/**
 * Custom URL scheme for in-app deep links (`iposigh://ipo/<slug>`).
 *
 * The short form `iposigh` is historical and already used by installed preview
 * builds and documentation. Display branding remains "IPO Singh". Changing the
 * scheme would break existing deep links — do not rename silently.
 */
export const appUrlScheme = "iposigh";

/** Android notification channel id. Must match ensureReminderChannel and the notifications plugin. */
export const androidReminderChannelId = "ipo-reminders";

/**
 * Application id used by development, development-device, and preview EAS profiles.
 *
 * Preserve this value for any APK already installed under this package: changing it
 * prevents Play / sideload upgrades over the existing binary.
 */
export const developmentApplicationId = "com.iposigh.mobile.dev";

/**
 * Application id intended for store production builds only.
 *
 * This is a different Android package / iOS bundle from preview. A production
 * install will not upgrade an existing `com.iposigh.mobile.dev` APK — treat the
 * first production upload as a new listing unless a deliberate Play migration
 * is approved. The `iposigh` token matches the historical scheme; the visible
 * app name is still "IPO Singh".
 *
 * Branding note: `iposigh` omits the "n" in Singh. A corrected id such as
 * `com.iposingh.mobile` is documented as an approval-gated proposal only —
 * do not change productionApplicationId without an explicit decision.
 */
export const productionApplicationId = "com.iposigh.mobile";

/**
 * Proposed corrected production application id (spelling). Not used by builds.
 * Availability on Google Play was not verified in-repo; treat as a developer decision.
 */
export const proposedCorrectedProductionApplicationId = "com.iposingh.mobile";

export const appDisplayName = "IPO Singh";

/** Expo slug (EAS project slug). Not shown as the home-screen title. */
export const appSlug = "ipo-singh";

/** Human-readable app version (versionName). Keep aligned with package.json and app.config.ts. */
export const appVersionName = "0.1.0";

/**
 * Android versionCode for the next store/upload binary.
 * Must increase monotonically for every Play upload of the same application id.
 * Do not bump casually during audits.
 */
export const androidVersionCode = 1;

/**
 * iOS CFBundleVersion / buildNumber for TestFlight and App Store uploads.
 * Must increase monotonically for every upload of the same bundle id.
 * Do not bump casually during audits.
 */
export const iosBuildNumber = "1";

/** Expo SDK 58 / RN baseline iOS deployment target. */
export const iosDeploymentTarget = "16.4";

/** Google Play target/compile SDK pinned for reproducible production AABs (API 36 / Android 16). */
export const androidTargetSdkVersion = 36;
export const androidCompileSdkVersion = 37;
export const androidMinSdkVersion = 24;

/**
 * Selects the native application id for the active Expo public environment.
 * Preview keeps the `.dev` id so existing internal APKs continue to upgrade.
 */
export function applicationIdForEnv(appEnv: AppEnvironment): string {
  return appEnv === "production" ? productionApplicationId : developmentApplicationId;
}

export type ApplicationIdMigration = {
  from: string;
  to: string;
  upgradesExistingPreviewApk: false;
  summary: string;
};

/** Documented migration when moving from internal preview to store production. */
export function productionIdentityMigration(): ApplicationIdMigration {
  return {
    from: developmentApplicationId,
    to: productionApplicationId,
    upgradesExistingPreviewApk: false,
    summary:
      "Production uses com.iposigh.mobile. Existing preview installs on com.iposigh.mobile.dev will not receive Play upgrades to production; uninstall preview or keep both as separate apps.",
  };
}

export type ProposedPackageRename = {
  currentProductionId: string;
  proposedProductionId: string;
  status: "approval-required";
  upgradesExistingProductionApk: false;
  upgradesExistingPreviewApk: false;
  summary: string;
};

/**
 * Spelling correction for the production package id. Not applied until approved.
 * Would create a new Play listing relative to com.iposigh.mobile if that id was already uploaded.
 */
export function proposedPackageRename(): ProposedPackageRename {
  return {
    currentProductionId: productionApplicationId,
    proposedProductionId: proposedCorrectedProductionApplicationId,
    status: "approval-required",
    upgradesExistingProductionApk: false,
    upgradesExistingPreviewApk: false,
    summary:
      "Renaming to com.iposingh.mobile requires explicit approval. It would not upgrade installs of com.iposigh.mobile or com.iposigh.mobile.dev. Google Play / App Store identifier availability was not verified automatically.",
  };
}
