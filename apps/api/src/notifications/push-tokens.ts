import { createAccountId } from "../accounts/tokens.ts";
import type { PushOwnerKind, PushPlatform, PushTokenStore } from "./push-records.ts";

export const maxActivePushTokens = 5;

export function anonymousPushOwnerId(installationId: string): string {
  return `anon:${installationId}`;
}

export function isAnonymousPushOwner(userId: string): boolean {
  return userId.startsWith("anon:");
}

export async function registerPushToken(
  store: PushTokenStore,
  input: {
    userId: string;
    deviceId: string;
    platform: PushPlatform;
    token: string;
    ownerKind?: PushOwnerKind;
    allotmentAlertsEnabled?: boolean;
    mainboardGlobalAlerts?: boolean;
    smeWatchlistAlerts?: boolean;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  const ownerKind = input.ownerKind ?? "user";
  const allotmentAlertsEnabled = input.allotmentAlertsEnabled ?? true;
  const mainboardGlobalAlerts = input.mainboardGlobalAlerts ?? false;
  const smeWatchlistAlerts = input.smeWatchlistAlerts ?? false;
  const existing = await store.findByToken(input.token);
  if (existing) {
    // Do not move an active signed-in token onto an anonymous owner.
    if (
      existing.status === "active" &&
      existing.ownerKind === "user" &&
      ownerKind === "anonymous" &&
      existing.userId !== input.userId
    ) {
      return;
    }
    await store.save({
      ...existing,
      userId: input.userId,
      deviceId: input.deviceId,
      platform: input.platform,
      ownerKind,
      allotmentAlertsEnabled: ownerKind === "anonymous" ? allotmentAlertsEnabled : true,
      mainboardGlobalAlerts: ownerKind === "anonymous" ? mainboardGlobalAlerts : false,
      smeWatchlistAlerts: ownerKind === "anonymous" ? smeWatchlistAlerts : false,
      status: "active",
      lastSeenAt: now,
      revokedAt: null,
      invalidAt: null,
    });
  } else {
    await store.insert({
      id: createAccountId(),
      userId: input.userId,
      deviceId: input.deviceId,
      platform: input.platform,
      token: input.token,
      status: "active",
      ownerKind,
      allotmentAlertsEnabled: ownerKind === "anonymous" ? allotmentAlertsEnabled : true,
      mainboardGlobalAlerts: ownerKind === "anonymous" ? mainboardGlobalAlerts : false,
      smeWatchlistAlerts: ownerKind === "anonymous" ? smeWatchlistAlerts : false,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
      invalidAt: null,
    });
  }

  const active = await store.listActive(input.userId);
  const overflow = active.length - maxActivePushTokens;
  if (overflow <= 0) return;
  const oldest = active
    .filter((item) => item.token !== input.token)
    .sort((left, right) => left.lastSeenAt.getTime() - right.lastSeenAt.getTime() || left.id.localeCompare(right.id));
  for (const item of oldest.slice(0, overflow)) {
    await store.save({ ...item, status: "revoked", revokedAt: now });
  }
}

export async function registerAnonymousPushToken(
  store: PushTokenStore,
  input: {
    installationId: string;
    platform: PushPlatform;
    token: string;
    allotmentAlertsEnabled?: boolean;
    mainboardGlobalAlerts?: boolean;
    smeWatchlistAlerts?: boolean;
    now?: Date;
  },
): Promise<void> {
  await registerPushToken(store, {
    userId: anonymousPushOwnerId(input.installationId),
    deviceId: input.installationId,
    platform: input.platform,
    token: input.token,
    ownerKind: "anonymous",
    allotmentAlertsEnabled: input.allotmentAlertsEnabled,
    mainboardGlobalAlerts: input.mainboardGlobalAlerts,
    smeWatchlistAlerts: input.smeWatchlistAlerts,
    now: input.now,
  });
}

export async function revokeOwnedPushToken(store: PushTokenStore, userId: string, token: string, now = new Date()): Promise<boolean> {
  const existing = await store.findByToken(token);
  if (!existing || existing.userId !== userId || existing.status !== "active") return false;
  await store.save({ ...existing, status: "revoked", revokedAt: now });
  return true;
}

export async function updateAnonymousDevicePreferences(
  store: PushTokenStore,
  input: {
    installationId: string;
    allotmentAlertsEnabled?: boolean;
    mainboardGlobalAlerts?: boolean;
    smeWatchlistAlerts?: boolean;
    now?: Date;
  },
): Promise<{ allotmentAlertsEnabled: boolean; mainboardGlobalAlerts: boolean; smeWatchlistAlerts: boolean } | null> {
  const now = input.now ?? new Date();
  const ownerId = anonymousPushOwnerId(input.installationId);
  const active = await store.listActive(ownerId);
  if (active.length === 0) return null;
  let latest = active[0]!;
  for (const item of active) {
    if (item.ownerKind !== "anonymous") continue;
    const next = {
      ...item,
      allotmentAlertsEnabled: input.allotmentAlertsEnabled ?? item.allotmentAlertsEnabled,
      mainboardGlobalAlerts: input.mainboardGlobalAlerts ?? item.mainboardGlobalAlerts,
      smeWatchlistAlerts: input.smeWatchlistAlerts ?? item.smeWatchlistAlerts,
      lastSeenAt: now,
    };
    await store.save(next);
    latest = next;
  }
  return {
    allotmentAlertsEnabled: latest.allotmentAlertsEnabled,
    mainboardGlobalAlerts: latest.mainboardGlobalAlerts,
    smeWatchlistAlerts: latest.smeWatchlistAlerts,
  };
}

/** @deprecated Use updateAnonymousDevicePreferences. */
export async function updateAnonymousAllotmentAlerts(
  store: PushTokenStore,
  input: { installationId: string; allotmentAlertsEnabled: boolean; now?: Date },
): Promise<boolean> {
  const updated = await updateAnonymousDevicePreferences(store, input);
  return updated !== null;
}
