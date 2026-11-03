import assert from "node:assert/strict";
import test from "node:test";
import {
  anonymousAllotmentEnabledKey,
  devicePushTokenPath,
  openPushExplanation,
  pushAvailability,
  pushPhaseAfterPermission,
  pushSetupCopy,
  pushUnavailableMessage,
  readExpoProjectId,
  requestPushOnLaunch,
  routeFromPushData,
} from "./push.ts";

test("push permission waits for an explanation and a real device project", () => {
  assert.equal(requestPushOnLaunch, false);
  assert.equal(openPushExplanation("idle"), "explaining");
  assert.equal(pushPhaseAfterPermission({ explaining: false, permission: "granted", token: "ExponentPushToken[abcdefghijklmnop]" }), "idle");
  assert.equal(pushPhaseAfterPermission({ explaining: true, permission: "denied", token: null }), "denied");
  assert.equal(openPushExplanation("denied"), "denied");
  assert.equal(openPushExplanation("registered"), "registered");
  assert.equal(pushPhaseAfterPermission({ explaining: true, permission: "granted", token: "ExponentPushToken[abcdefghijklmnop]" }), "registered");
  assert.equal(pushAvailability({ projectId: null, isDevice: true, platform: "ios" }), "needs-project");
  assert.equal(pushAvailability({ projectId: "project", isDevice: false, platform: "android" }), "needs-device");
  assert.equal(pushAvailability({ projectId: "project", isDevice: true, platform: "ios" }), "ready");
  assert.equal(pushUnavailableMessage("needs-project").includes("not requested"), true);
  assert.equal(readExpoProjectId({ eas: { projectId: "  " } }), null);
  assert.equal(readExpoProjectId({ eas: { projectId: "eas-project" } }), "eas-project");
  assert.equal(readExpoProjectId({ easProjectId: "env-project" }), "env-project");
  assert.equal(routeFromPushData({ slug: "fixture-polymers" })?.params.slug, "fixture-polymers");
  assert.match(pushSetupCopy, /Mainboard IPOs you opt into/);
  assert.match(pushSetupCopy, /SME IPOs you save/);
  assert.equal(pushSetupCopy.toLowerCase().includes("email"), true);
  assert.equal(anonymousAllotmentEnabledKey.startsWith("ipo-singh."), true);
  assert.equal(devicePushTokenPath, "/api/v1/notifications/device-push-tokens");
});

test("a notification tap opens the stored IPO and ignores an announcement", () => {
  assert.equal(routeFromPushData({ ipoId: "fixture-mills" })?.params.slug, "fixture-mills");
  assert.equal(routeFromPushData({ ipoId: null }), null);
  assert.equal(routeFromPushData({ title: "Fixture Mills" }), null);
  assert.equal(routeFromPushData("fixture-mills"), null);
});
