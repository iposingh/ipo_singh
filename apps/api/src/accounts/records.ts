import type { AccountClient, AccountLifecycle, AccountPreferences, AccountRevokeReason, AccountRole } from "@ipo-singh/contracts";

export type UserRecord = {
  id: string;
  email: string | null;
  displayName: string | null;
  status: AccountLifecycle;
  role: AccountRole;
  preferences: AccountPreferences;
  createdAt: Date;
  updatedAt: Date;
  statusChangedAt: Date;
  lastAuthenticatedAt: Date | null;
  suspendedAt: Date | null;
  closedAt: Date | null;
  /** Argon2id encoded hash. Null until a password is set. Never copied into a public response. */
  passwordHash: string | null;
};

export type DeviceRecord = {
  id: string;
  userId: string;
  client: AccountClient;
  label: string | null;
  /** Mobile install id. Null for website browsers. Not exposed on public device payloads. */
  installationId: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type SessionRecord = {
  id: string;
  userId: string;
  deviceId: string;
  client: AccountClient;
  accessTokenHash: string;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  csrfTokenHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  createdAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  revokeReason: AccountRevokeReason | null;
};

export type AccountStore = {
  insertUser(user: UserRecord): Promise<void>;
  findUser(id: string): Promise<UserRecord | null>;
  findUsers(ids: readonly string[]): Promise<UserRecord[]>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  /** Active and suspended accounts. Closed rows are omitted so the last super admin stays protected. */
  countRole(role: AccountRole): Promise<number>;
  countStatus(status: AccountLifecycle): Promise<number>;
  saveUser(user: UserRecord): Promise<void>;
  insertDevice(device: DeviceRecord): Promise<void>;
  findDevice(id: string): Promise<DeviceRecord | null>;
  saveDevice(device: DeviceRecord): Promise<void>;
  insertSession(session: SessionRecord): Promise<void>;
  findSessionById(id: string): Promise<SessionRecord | null>;
  findSessionByAccessHash(hash: string): Promise<SessionRecord | null>;
  findSessionByRefreshHash(hash: string): Promise<SessionRecord | null>;
  findSessionByPreviousRefreshHash(hash: string): Promise<SessionRecord | null>;
  saveSession(session: SessionRecord): Promise<void>;
  listSessionsForUser(userId: string): Promise<SessionRecord[]>;
  listDevicesForUser(userId: string): Promise<DeviceRecord[]>;
  revokeSessionsForUser(userId: string, revokedAt: Date, reason: AccountRevokeReason): Promise<void>;
  revokeSessionsForUserExcept(userId: string, keepSessionId: string, revokedAt: Date, reason: AccountRevokeReason): Promise<void>;
  /** Marks sessions whose refresh lifetime has ended. Rows stay for the audit trail. */
  expireSessions(now: Date): Promise<void>;
};
