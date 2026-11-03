import {
  accessTokenTtlMs,
  accountEmailSchema,
  accountPreferencesSchema,
  defaultAccountPreferences,
  refreshTokenTtlMs,
  type AccountClient,
  type AccountPreferences,
  type AccountRevokeReason,
  type PublicAccount,
  type PublicDevice,
  type PublicSession,
} from "@ipo-singh/contracts";
import type { AccountStore, DeviceRecord, SessionRecord, UserRecord } from "./records.ts";
import { createAccountId, createToken, hashToken, isTokenShape } from "./tokens.ts";

export class AccountStateError extends Error {
  readonly reason: "duplicate" | "missing" | "invalid" | "reuse";

  constructor(reason: AccountStateError["reason"]) {
    super(reason);
    this.name = "AccountStateError";
    this.reason = reason;
  }
}

export type IssuedSession = {
  user: UserRecord;
  device: DeviceRecord;
  session: SessionRecord;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
};

function stamp(date: Date): string {
  return date.toISOString();
}

export function normalizeAccountPreferences(value: AccountPreferences | null | undefined): AccountPreferences {
  const current = value ?? defaultAccountPreferences;
  const legacy = current as AccountPreferences & {
    mainboardGlobalAlerts?: boolean;
    smeWatchlistAlerts?: boolean;
  };
  // Existing accounts that already enabled alerts keep SME watchlist delivery.
  // Mainboard global stays off until an explicit opt-in (never expand silently).
  const smeWatchlistAlerts =
    typeof legacy.smeWatchlistAlerts === "boolean" ? legacy.smeWatchlistAlerts : legacy.alertsEnabled === true;
  const mainboardGlobalAlerts = typeof legacy.mainboardGlobalAlerts === "boolean" ? legacy.mainboardGlobalAlerts : false;
  const parsed = accountPreferencesSchema.safeParse({
    ...defaultAccountPreferences,
    ...current,
    timeZone: "Asia/Kolkata",
    mainboardGlobalAlerts,
    smeWatchlistAlerts,
    notificationCategories: {
      ...defaultAccountPreferences.notificationCategories,
      ...current.notificationCategories,
    },
    watchlistDisplay: {
      ...defaultAccountPreferences.watchlistDisplay,
      ...current.watchlistDisplay,
    },
  });
  return parsed.success ? parsed.data : defaultAccountPreferences;
}

export function toPublicAccount(user: UserRecord): PublicAccount {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    role: user.role,
    preferences: normalizeAccountPreferences(user.preferences),
    createdAt: stamp(user.createdAt),
    updatedAt: stamp(user.updatedAt),
    statusChangedAt: stamp(user.statusChangedAt),
    lastAuthenticatedAt: user.lastAuthenticatedAt ? stamp(user.lastAuthenticatedAt) : null,
  };
}

export function toPublicDevice(device: DeviceRecord): PublicDevice {
  return {
    id: device.id,
    client: device.client,
    label: device.label,
    createdAt: stamp(device.createdAt),
    lastSeenAt: stamp(device.lastSeenAt),
    revokedAt: device.revokedAt ? stamp(device.revokedAt) : null,
  };
}

export function toPublicSession(session: SessionRecord, currentSessionId: string | null): PublicSession {
  return {
    id: session.id,
    deviceId: session.deviceId,
    client: session.client,
    createdAt: stamp(session.createdAt),
    accessExpiresAt: stamp(session.accessExpiresAt),
    refreshExpiresAt: stamp(session.refreshExpiresAt),
    revokedAt: session.revokedAt ? stamp(session.revokedAt) : null,
    current: session.id === currentSessionId,
  };
}

function cleanDisplayName(value: string | null | undefined): string | null {
  const name = value?.trim() ?? "";
  return name ? name.slice(0, 80) : null;
}

function cleanEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function createPendingUser(
  store: AccountStore,
  input: { email: string; displayName?: string | null; preferences?: AccountPreferences },
  now = new Date(),
): Promise<UserRecord> {
  const email = accountEmailSchema.safeParse(cleanEmail(input.email));
  if (!email.success) throw new AccountStateError("invalid");
  const preferences = input.preferences ? accountPreferencesSchema.safeParse(input.preferences) : { success: true as const, data: defaultAccountPreferences };
  if (!preferences.success) throw new AccountStateError("invalid");
  if (await store.findUserByEmail(email.data)) throw new AccountStateError("duplicate");
  const user: UserRecord = {
    id: createAccountId(),
    email: email.data,
    displayName: cleanDisplayName(input.displayName),
    status: "pending",
    role: "member",
    preferences: preferences.data,
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    lastAuthenticatedAt: null,
    suspendedAt: null,
    closedAt: null,
    passwordHash: null,
  };
  await store.insertUser(user);
  return user;
}

export async function activateUser(store: AccountStore, userId: string, now = new Date()): Promise<UserRecord> {
  const user = await store.findUser(userId);
  if (!user || user.status === "closed" || user.status === "suspended") throw new AccountStateError("invalid");
  const next = { ...user, status: "active" as const, updatedAt: now, statusChangedAt: now };
  await store.saveUser(next);
  return next;
}

export async function registerDevice(
  store: AccountStore,
  input: { userId: string; client: AccountClient; label?: string | null; installationId?: string | null },
  now = new Date(),
): Promise<DeviceRecord> {
  const user = await store.findUser(input.userId);
  if (!user) throw new AccountStateError("missing");
  const installationId = input.installationId?.trim() || null;
  if (installationId) {
    const existing = (await store.listDevicesForUser(user.id)).find(
      (device) => !device.revokedAt && device.client === input.client && device.installationId === installationId,
    );
    if (existing) {
      const sessions = await store.listSessionsForUser(user.id);
      for (const session of sessions) {
        if (session.deviceId === existing.id && !session.revokedAt) {
          await revokeSession(store, session.id, "user", now);
        }
      }
      const reused: DeviceRecord = {
        ...existing,
        label: cleanDisplayName(input.label) ?? existing.label,
        lastSeenAt: now,
      };
      await store.saveDevice(reused);
      return reused;
    }
  }
  const device: DeviceRecord = {
    id: createAccountId(),
    userId: user.id,
    client: input.client,
    label: cleanDisplayName(input.label),
    installationId,
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
  await store.insertDevice(device);
  return device;
}

function issueMaterial(now: Date) {
  const accessToken = createToken();
  const refreshToken = createToken();
  const csrfToken = createToken();
  return {
    accessToken,
    refreshToken,
    csrfToken,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    csrfTokenHash: hashToken(csrfToken),
    accessExpiresAt: new Date(now.getTime() + accessTokenTtlMs),
    refreshExpiresAt: new Date(now.getTime() + refreshTokenTtlMs),
  };
}

export async function issueSession(store: AccountStore, input: { userId: string; deviceId: string }, now = new Date()): Promise<IssuedSession> {
  const user = await store.findUser(input.userId);
  const device = await store.findDevice(input.deviceId);
  if (!user || !device || device.userId !== user.id) throw new AccountStateError("missing");
  if (user.status !== "active" || device.revokedAt) throw new AccountStateError("invalid");
  const material = issueMaterial(now);
  const session: SessionRecord = {
    id: createAccountId(),
    userId: user.id,
    deviceId: device.id,
    client: device.client,
    accessTokenHash: material.accessTokenHash,
    refreshTokenHash: material.refreshTokenHash,
    previousRefreshTokenHash: null,
    csrfTokenHash: material.csrfTokenHash,
    accessExpiresAt: material.accessExpiresAt,
    refreshExpiresAt: material.refreshExpiresAt,
    createdAt: now,
    rotatedAt: null,
    revokedAt: null,
    revokeReason: null,
  };
  await store.insertSession(session);
  const seen = { ...device, lastSeenAt: now };
  const authenticated = { ...user, lastAuthenticatedAt: now, updatedAt: now };
  await store.saveDevice(seen);
  await store.saveUser(authenticated);
  return {
    user: authenticated,
    device: seen,
    session,
    accessToken: material.accessToken,
    refreshToken: material.refreshToken,
    csrfToken: material.csrfToken,
  };
}

async function usableSession(store: AccountStore, session: SessionRecord | null, now: Date): Promise<SessionRecord | null> {
  if (!session || session.revokedAt || session.refreshExpiresAt.getTime() <= now.getTime()) return null;
  const user = await store.findUser(session.userId);
  const device = await store.findDevice(session.deviceId);
  if (!user || user.status !== "active" || !device || device.revokedAt) return null;
  return session;
}

export type AccessResolution =
  | { status: "invalid" }
  | { status: "user"; user: UserRecord; session: SessionRecord };

export async function resolveAccess(store: AccountStore, token: string, now = new Date()): Promise<AccessResolution> {
  const session = await authenticateAccessToken(store, token, now);
  if (!session) return { status: "invalid" };
  const user = await store.findUser(session.userId);
  if (!user || user.status !== "active") return { status: "invalid" };
  return { status: "user", user, session };
}

export async function authenticateAccessToken(store: AccountStore, token: string, now = new Date()): Promise<SessionRecord | null> {
  if (!isTokenShape(token)) return null;
  const session = await usableSession(store, await store.findSessionByAccessHash(hashToken(token)), now);
  if (!session || session.accessExpiresAt.getTime() <= now.getTime()) return null;
  return session;
}

export async function rotateSession(store: AccountStore, refreshToken: string, now = new Date()): Promise<IssuedSession> {
  if (!isTokenShape(refreshToken)) throw new AccountStateError("invalid");
  const hash = hashToken(refreshToken);
  const current = await store.findSessionByRefreshHash(hash);
  if (!current) {
    const reused = await store.findSessionByPreviousRefreshHash(hash);
    if (reused && !reused.revokedAt) {
      await revokeSession(store, reused.id, "rotation_reuse", now);
    }
    throw new AccountStateError(reused ? "reuse" : "invalid");
  }
  const session = await usableSession(store, current, now);
  if (!session) throw new AccountStateError("invalid");
  const user = await store.findUser(session.userId);
  const device = await store.findDevice(session.deviceId);
  if (!user || !device) throw new AccountStateError("missing");
  const material = issueMaterial(now);
  const next: SessionRecord = {
    ...session,
    previousRefreshTokenHash: session.refreshTokenHash,
    accessTokenHash: material.accessTokenHash,
    refreshTokenHash: material.refreshTokenHash,
    csrfTokenHash: material.csrfTokenHash,
    accessExpiresAt: material.accessExpiresAt,
    refreshExpiresAt: material.refreshExpiresAt,
    rotatedAt: now,
  };
  await store.saveSession(next);
  const seen = { ...device, lastSeenAt: now };
  const authenticated = { ...user, lastAuthenticatedAt: now, updatedAt: now };
  await store.saveDevice(seen);
  await store.saveUser(authenticated);
  return { user: authenticated, device: seen, session: next, accessToken: material.accessToken, refreshToken: material.refreshToken, csrfToken: material.csrfToken };
}

export async function revokeSession(store: AccountStore, sessionId: string, reason: AccountRevokeReason, now = new Date()): Promise<void> {
  const session = await store.findSessionById(sessionId);
  if (!session || session.revokedAt) return;
  await store.saveSession({ ...session, revokedAt: now, revokeReason: reason });
}

export async function suspendUser(store: AccountStore, userId: string, now = new Date()): Promise<UserRecord> {
  const user = await store.findUser(userId);
  if (!user || user.status === "closed") throw new AccountStateError("invalid");
  const next: UserRecord = { ...user, status: "suspended", updatedAt: now, statusChangedAt: now, suspendedAt: now };
  await store.saveUser(next);
  await store.revokeSessionsForUser(userId, now, "suspended");
  return next;
}

export async function closeUser(store: AccountStore, userId: string, now = new Date()): Promise<UserRecord> {
  const user = await store.findUser(userId);
  if (!user || user.status === "closed") throw new AccountStateError("invalid");
  const next: UserRecord = { ...user, status: "closed", updatedAt: now, statusChangedAt: now, closedAt: now };
  await store.saveUser(next);
  await store.revokeSessionsForUser(userId, now, "closed");
  return next;
}
