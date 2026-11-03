import type { AccountRevokeReason } from "@ipo-singh/contracts";
import { AccountSessionModel } from "../db/models/account-session.ts";
import { AccountDeviceModel } from "../db/models/device.ts";
import { AccountUserModel } from "../db/models/user.ts";
import type { AccountStore, DeviceRecord, SessionRecord, UserRecord } from "./records.ts";
import { normalizeAccountPreferences } from "./session-service.ts";

type UserDoc = {
  _id: string;
  email: string;
  displayName: string | null;
  status: UserRecord["status"];
  role: string;
  preferences: UserRecord["preferences"];
  createdAt: Date;
  updatedAt: Date;
  statusChangedAt: Date;
  lastAuthenticatedAt: Date | null;
  suspendedAt: Date | null;
  closedAt: Date | null;
  passwordHash: string | null;
};

type DeviceDoc = {
  _id: string;
  userId: string;
  client: DeviceRecord["client"];
  label: string | null;
  installationId?: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

type SessionDoc = {
  _id: string;
  userId: string;
  deviceId: string;
  client: SessionRecord["client"];
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

function accountRole(role: string): UserRecord["role"] {
  if (role === "admin" || role === "super-admin") return role;
  if (role === "operator") return "admin";
  return "member";
}

function userFrom(doc: UserDoc): UserRecord {
  return {
    id: doc._id,
    email: doc.email,
    displayName: doc.displayName,
    status: doc.status,
    role: accountRole(doc.role),
    preferences: normalizeAccountPreferences(doc.preferences),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    statusChangedAt: doc.statusChangedAt,
    lastAuthenticatedAt: doc.lastAuthenticatedAt,
    suspendedAt: doc.suspendedAt,
    closedAt: doc.closedAt,
    passwordHash: doc.passwordHash ?? null,
  };
}

function deviceFrom(doc: DeviceDoc): DeviceRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    client: doc.client,
    label: doc.label,
    installationId: doc.installationId ?? null,
    createdAt: doc.createdAt,
    lastSeenAt: doc.lastSeenAt,
    revokedAt: doc.revokedAt,
  };
}

function sessionFrom(doc: SessionDoc): SessionRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    deviceId: doc.deviceId,
    client: doc.client,
    accessTokenHash: doc.accessTokenHash,
    refreshTokenHash: doc.refreshTokenHash,
    previousRefreshTokenHash: doc.previousRefreshTokenHash,
    csrfTokenHash: doc.csrfTokenHash,
    accessExpiresAt: doc.accessExpiresAt,
    refreshExpiresAt: doc.refreshExpiresAt,
    createdAt: doc.createdAt,
    rotatedAt: doc.rotatedAt,
    revokedAt: doc.revokedAt,
    revokeReason: doc.revokeReason,
  };
}

function userFields(user: UserRecord): Omit<UserDoc, "_id"> {
  return {
    email: user.email ?? "",
    displayName: user.displayName,
    status: user.status,
    role: user.role,
    preferences: user.preferences,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    statusChangedAt: user.statusChangedAt,
    lastAuthenticatedAt: user.lastAuthenticatedAt,
    suspendedAt: user.suspendedAt,
    closedAt: user.closedAt,
    passwordHash: user.passwordHash,
  };
}

export function createMongoAccountStore(): AccountStore {
  return {
    async insertUser(user) {
      if (!user.email) throw new Error("Account email is required.");
      await AccountUserModel.create({ _id: user.id, ...userFields(user), email: user.email });
    },
    async findUsers(ids) {
      if (ids.length === 0) return [];
      const docs = await AccountUserModel.find({ _id: { $in: ids.slice(0, 100) } }).lean<UserDoc[]>();
      return docs.map(userFrom);
    },
    async findUser(id) {
      const doc = await AccountUserModel.findById(id).lean<UserDoc | null>();
      return doc ? userFrom(doc) : null;
    },
    async findUserByEmail(email) {
      const doc = await AccountUserModel.findOne({ email }).lean<UserDoc | null>();
      return doc ? userFrom(doc) : null;
    },
    async countRole(role) {
      return AccountUserModel.countDocuments({ role, status: { $ne: "closed" } });
    },
    async countStatus(status) {
      return AccountUserModel.countDocuments({ status });
    },
    async saveUser(user) {
      if (!user.email) throw new Error("Account email is required.");
      await AccountUserModel.updateOne({ _id: user.id }, { $set: { ...userFields(user), email: user.email } });
    },
    async insertDevice(device) {
      await AccountDeviceModel.create({
        _id: device.id,
        userId: device.userId,
        client: device.client,
        label: device.label,
        installationId: device.installationId,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt,
        revokedAt: device.revokedAt,
      });
    },
    async findDevice(id) {
      const doc = await AccountDeviceModel.findById(id).lean<DeviceDoc | null>();
      return doc ? deviceFrom(doc) : null;
    },
    async saveDevice(device) {
      await AccountDeviceModel.updateOne(
        { _id: device.id },
        {
          $set: {
            userId: device.userId,
            client: device.client,
            label: device.label,
            installationId: device.installationId,
            createdAt: device.createdAt,
            lastSeenAt: device.lastSeenAt,
            revokedAt: device.revokedAt,
          },
        },
      );
    },
    async insertSession(session) {
      const { id, ...fields } = session;
      await AccountSessionModel.create({ _id: id, ...fields });
    },
    async findSessionById(id) {
      const doc = await AccountSessionModel.findById(id).lean<SessionDoc | null>();
      return doc ? sessionFrom(doc) : null;
    },
    async findSessionByAccessHash(hash) {
      const doc = await AccountSessionModel.findOne({ accessTokenHash: hash }).lean<SessionDoc | null>();
      return doc ? sessionFrom(doc) : null;
    },
    async findSessionByRefreshHash(hash) {
      const doc = await AccountSessionModel.findOne({ refreshTokenHash: hash }).lean<SessionDoc | null>();
      return doc ? sessionFrom(doc) : null;
    },
    async findSessionByPreviousRefreshHash(hash) {
      const doc = await AccountSessionModel.findOne({ previousRefreshTokenHash: hash }).lean<SessionDoc | null>();
      return doc ? sessionFrom(doc) : null;
    },
    async saveSession(session) {
      const { id, ...fields } = session;
      await AccountSessionModel.updateOne({ _id: id }, { $set: fields });
    },
    async listSessionsForUser(userId) {
      const docs = await AccountSessionModel.find({ userId }).sort({ createdAt: -1 }).limit(20).lean<SessionDoc[]>();
      return docs.map(sessionFrom);
    },
    async listDevicesForUser(userId) {
      const docs = await AccountDeviceModel.find({ userId }).sort({ lastSeenAt: -1 }).limit(20).lean<DeviceDoc[]>();
      return docs.map(deviceFrom);
    },
    async revokeSessionsForUser(userId, revokedAt, reason) {
      await AccountSessionModel.updateMany({ userId, revokedAt: null }, { $set: { revokedAt, revokeReason: reason } });
    },
    async revokeSessionsForUserExcept(userId, keepSessionId, revokedAt, reason) {
      await AccountSessionModel.updateMany(
        { userId, _id: { $ne: keepSessionId }, revokedAt: null },
        { $set: { revokedAt, revokeReason: reason } },
      );
    },
    async expireSessions(now) {
      await AccountSessionModel.updateMany(
        { revokedAt: null, refreshExpiresAt: { $lte: now } },
        { $set: { revokedAt: now, revokeReason: "expired" } },
      );
    },
  };
}
