import { notificationIssueRoute } from "./inbox.ts";

/** Permission is requested only after the person opens the explanation and confirms it. */
export const requestPushOnLaunch = false;

export const pushTokenPath = "/api/v1/notifications/push-tokens";

export const devicePushTokenPath = "/api/v1/notifications/device-push-tokens";

export const devicePushPreferencesPath = "/api/v1/notifications/device-push-tokens/preferences";

export const pushTokenKey = "ipo-singh.push-token";

export const installationIdKey = "ipo-singh.installation-id";

/** Marks that this installation opted into anonymous allotment-out pushes. */
export const anonymousAllotmentEnabledKey = "ipo-singh.anon-allotment-enabled";

export const pushSetupCopy =
  "IPO Singh can remind this phone about Mainboard IPOs you opt into (watchlist not required) and SME IPOs you save. Opening, closing, listing, allotment, schedule, GMP, and subscription categories stay off until you enable them. Email and SMS are not used.";

export type PushPhase = "idle" | "explaining" | "denied" | "registered" | "unavailable";

export type PushAvailability = "ready" | "needs-device" | "needs-project";

export function openPushExplanation(phase: PushPhase): PushPhase {
  if (phase === "registered" || phase === "denied" || phase === "unavailable") return phase;
  return "explaining";
}

/** A permission result is ignored until the explanation has been opened. */
export function pushPhaseAfterPermission(input: {
  explaining: boolean;
  permission: "granted" | "denied" | "undetermined";
  token: string | null;
}): PushPhase {
  if (!input.explaining) return "idle";
  if (input.permission === "denied") return "denied";
  if (input.permission === "granted" && input.token) return "registered";
  return "unavailable";
}

export function pushAvailability(input: { projectId: string | null; isDevice: boolean; platform: string }): PushAvailability {
  if ((input.platform !== "ios" && input.platform !== "android") || !input.isDevice) return "needs-device";
  if (!input.projectId) return "needs-project";
  return "ready";
}

export function readExpoProjectId(extra: unknown): string | null {
  if (extra && typeof extra === "object" && "eas" in extra) {
    const eas = extra.eas;
    if (eas && typeof eas === "object" && "projectId" in eas) {
      const projectId = eas.projectId;
      if (typeof projectId === "string" && projectId.trim().length > 0) return projectId.trim();
    }
  }
  if (extra && typeof extra === "object" && "easProjectId" in extra) {
    const projectId = extra.easProjectId;
    if (typeof projectId === "string" && projectId.trim().length > 0) return projectId.trim();
  }
  return null;
}

export function routeFromPushData(data: unknown): ReturnType<typeof notificationIssueRoute> {
  if (!data || typeof data !== "object") return null;
  if ("slug" in data && typeof data.slug === "string") return notificationIssueRoute(data.slug);
  if ("ipoId" in data && typeof data.ipoId === "string") return notificationIssueRoute(data.ipoId);
  return null;
}

export function pushUnavailableMessage(availability: PushAvailability): string {
  if (availability === "needs-project") {
    return "Phone reminders need an EAS project id from eas init. Notification permission is not requested until that id is set.";
  }
  return "Phone reminders need a development build on a physical iPhone or Android phone. Expo Go does not deliver these remote reminders, and permission is not requested here.";
}
