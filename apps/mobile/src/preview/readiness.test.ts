import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { androidEmulatorApiOrigin, developmentApiOrigin, resolveApiOrigin } from "../api/origin.ts";
import { forbiddenMobileSecretNames, publicMobileEnvKeys } from "../security/privacy.ts";
import {
  androidTargetSdkVersion,
  androidVersionCode,
  appVersionName,
  applicationIdForEnv,
  developmentApplicationId,
  iosBuildNumber,
  iosDeploymentTarget,
  productionApplicationId,
  productionIdentityMigration,
  proposedCorrectedProductionApplicationId,
  proposedPackageRename,
} from "./identity.ts";
import {
  androidVersioningContract,
  declaredAndroidPermissions,
  deepLinkExamples,
  expectedMergedAndroidPermissions,
  iosVersioningContract,
  nativeVersusOtaGuide,
  previewEnvironmentGuide,
  previewNavigationContract,
  previewPrimaryTabs,
  readEasProfiles,
  readMobilePackageJson,
  readUpdatesConfig,
} from "./readiness.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("Expo SDK 58 app keeps the Expo Router entry and a development client dependency", () => {
  const pkg = readMobilePackageJson();
  assert.equal(pkg.name, "@ipo-singh/mobile");
  assert.equal(pkg.main, "expo-router/entry");
  assert.match(pkg.dependencies.expo, /~58\./);
  assert.match(pkg.dependencies["expo-router"], /~58\./);
  assert.match(pkg.dependencies["expo-dev-client"], /~58\./);
  assert.match(pkg.dependencies["expo-notifications"], /~58\./);
  assert.match(pkg.dependencies["expo-secure-store"], /~58\./);
  assert.match(pkg.dependencies["react-native-safe-area-context"], /~/);
});

test("app configuration names IPO Singh, portrait, automatic appearance, and deep-link scheme", () => {
  const configSource = readFileSync(join(root, "app.config.ts"), "utf8");
  assert.match(configSource, /name:\s*appDisplayName/);
  assert.match(configSource, /orientation:\s*"portrait"/);
  assert.match(configSource, /userInterfaceStyle:\s*"automatic"/);
  assert.match(configSource, /scheme:\s*appUrlScheme/);
  assert.match(configSource, /bundleIdentifier:\s*applicationId/);
  assert.match(configSource, /productionApplicationId/);
  assert.match(configSource, /expo-build-properties/);
  assert.match(configSource, /usesCleartextTraffic:\s*isDevelopment/);
  assert.match(configSource, /POST_NOTIFICATIONS/);
  assert.match(configSource, /intentFilters/);
  assert.match(configSource, /expo-dev-client/);
  assert.match(configSource, /expo-updates/);
  assert.match(configSource, /runtimeVersion/);
  assert.match(configSource, /defaultChannel:\s*androidReminderChannelId/);
  assert.match(configSource, /predictiveBackGestureEnabled:\s*false/);
  assert.match(configSource, /appUrlScheme = "iposigh"/);
  assert.match(configSource, /androidReminderChannelId = "ipo-reminders"/);
  assert.match(configSource, /versionCode:\s*androidVersionCode/);
  assert.match(configSource, /buildNumber:\s*iosBuildNumber/);
  assert.match(configSource, /deploymentTarget:\s*iosDeploymentTarget/);
  assert.match(configSource, /ITSAppUsesNonExemptEncryption:\s*false/);
  assert.match(configSource, /targetSdkVersion:\s*androidTargetSdkVersion/);
  assert.match(configSource, /compileSdkVersion:\s*androidCompileSdkVersion/);
  assert.equal(previewNavigationContract().displayName, "IPO Singh");
  assert.equal(previewNavigationContract().scheme, "iposigh");
  assert.equal(previewNavigationContract().reminderChannelId, "ipo-reminders");
  assert.deepEqual(previewNavigationContract().primaryTabs, [...previewPrimaryTabs]);
});

test("Android versioning and package identity stay Play-ready without silent renames", () => {
  const contract = androidVersioningContract();
  assert.equal(contract.versionName, appVersionName);
  assert.equal(contract.versionCode, androidVersionCode);
  assert.equal(contract.versionCode, 1);
  assert.equal(contract.targetSdkVersion, androidTargetSdkVersion);
  assert.equal(contract.targetSdkVersion, 36);
  assert.equal(contract.productionPackageId, "com.iposigh.mobile");
  assert.equal(contract.previewPackageId, "com.iposigh.mobile.dev");
  assert.equal(contract.productionBuildType, "app-bundle");
  assert.equal(contract.previewBuildType, "apk");
  assert.equal(proposedCorrectedProductionApplicationId, "com.iposingh.mobile");
  assert.equal(proposedPackageRename().status, "approval-required");
  assert.equal(productionIdentityMigration().upgradesExistingPreviewApk, false);
  assert.deepEqual([...declaredAndroidPermissions()], ["POST_NOTIFICATIONS"]);
  assert.ok(expectedMergedAndroidPermissions().includes("android.permission.INTERNET"));
  const configSource = readFileSync(join(root, "app.config.ts"), "utf8");
  assert.equal(configSource.includes("com.iposingh.mobile"), false);
  assert.match(configSource, /com\.iposigh\.mobile/);
});

test("iOS versioning and EAS profiles support device and store builds without silent renames", () => {
  const contract = iosVersioningContract();
  assert.equal(contract.versionName, "0.1.0");
  assert.equal(contract.buildNumber, iosBuildNumber);
  assert.equal(contract.buildNumber, "1");
  assert.equal(contract.deploymentTarget, iosDeploymentTarget);
  assert.equal(contract.productionBundleId, "com.iposigh.mobile");
  assert.equal(contract.previewBundleId, "com.iposigh.mobile.dev");
  assert.equal(contract.packageRenameStatus, "approval-required");
  const profiles = readEasProfiles();
  assert.equal(profiles.hasSimulatorDevelopment, true);
  assert.equal(profiles.hasPhysicalIosDevelopment, true);
  assert.equal(profiles.hasIosPreviewDeviceBuild, true);
  assert.equal(profiles.hasIosStoreProduction, true);
  assert.notEqual(profiles.hasSimulatorDevelopment && profiles.hasPhysicalIosDevelopment, false);
});

test("EAS profiles include a Metro development client, preview APK, and production AAB", () => {
  const profiles = readEasProfiles();
  assert.equal(profiles.developmentClient, true);
  assert.equal(profiles.hasPreviewApk, true);
  assert.equal(profiles.hasProductionAab, true);
  assert.equal(profiles.hasSimulatorDevelopment, true);
  assert.equal(profiles.channels.preview, "preview");
  assert.equal(profiles.channels.production, "production");
  assert.ok(profiles.profiles.includes("development"));
  assert.ok(profiles.profiles.includes("development-device"));
  assert.ok(profiles.profiles.includes("preview"));
  assert.ok(profiles.profiles.includes("production"));
  const eas = readFileSync(join(root, "eas.json"), "utf8");
  assert.equal(eas.includes("IPO_GURU"), false);
  assert.equal(eas.includes("MONGODB"), false);
  assert.equal(eas.includes("REDIS"), false);
  assert.equal(eas.includes("R2_"), false);
  assert.equal(eas.includes("trycloudflare"), false);
});

test("local, Android emulator, and staging API origins stay distinct", () => {
  assert.equal(developmentApiOrigin, "http://127.0.0.1:4000");
  assert.equal(androidEmulatorApiOrigin, "http://10.0.2.2:4000");
  assert.deepEqual(resolveApiOrigin("development", androidEmulatorApiOrigin), {
    ok: true,
    origin: androidEmulatorApiOrigin,
  });
  assert.deepEqual(resolveApiOrigin("preview", "https://api-staging.example.com"), {
    ok: true,
    origin: "https://api-staging.example.com",
  });
  assert.equal(previewEnvironmentGuide("development").cleartextHttpAllowed, true);
  assert.equal(previewEnvironmentGuide("preview").cleartextHttpAllowed, false);
  assert.equal(previewEnvironmentGuide("production").cleartextHttpAllowed, false);
  assert.equal(previewEnvironmentGuide("preview").applicationId, developmentApplicationId);
  assert.equal(previewEnvironmentGuide("production").applicationId, productionApplicationId);
  assert.equal(applicationIdForEnv("preview"), developmentApplicationId);
  assert.equal(applicationIdForEnv("production"), productionApplicationId);
  assert.equal(productionIdentityMigration().upgradesExistingPreviewApk, false);
});

test("EAS Update is configured with channels and a native-vs-OTA boundary", () => {
  const updates = readUpdatesConfig();
  assert.equal(updates.hasExpoUpdatesDependency, true);
  assert.equal(updates.runtimeVersionPolicy, "appVersion");
  assert.equal(updates.updatesUrlConfigured, true);
  assert.match(readMobilePackageJson().dependencies["expo-updates"] ?? "", /~/);
  const guide = nativeVersusOtaGuide();
  assert.ok(guide.requiresNativeRebuild.some((line) => line.includes("native modules")));
  assert.ok(guide.otaEligible.some((line) => line.includes("runtimeVersion")));
});

test("deep-link examples use the app scheme and public env stays secret-free", () => {
  assert.deepEqual(deepLinkExamples("fixture-mills"), {
    home: "iposigh://",
    ipo: "iposigh://ipo/fixture-mills",
    news: "iposigh://news/fixture-mills",
  });
  const example = readFileSync(join(root, ".env.example"), "utf8");
  for (const key of publicMobileEnvKeys) {
    assert.match(example, new RegExp(key));
  }
  for (const name of forbiddenMobileSecretNames) {
    assert.equal(example.toUpperCase().includes(`EXPO_PUBLIC_${name}`), false);
  }
  assert.match(example, /10\.0\.2\.2:4000/);
});

test("brand assets exist for icon, adaptive icon, and splash", () => {
  for (const file of ["icon.png", "adaptive-icon.png", "splash-icon.png"]) {
    const bytes = readFileSync(join(root, "assets", file));
    assert.ok(bytes.byteLength > 1_000, `${file} looks empty`);
  }
});
