import type { AccountRevokeReason } from "@ipo-singh/contracts";
import type { AccountStore, DeviceRecord, SessionRecord, UserRecord } from "./records.ts";

export function createMemoryAccountStore(): AccountStore {
  const users = new Map<string, UserRecord>();
  const devices = new Map<string, DeviceRecord>();
  const sessions = new Map<string, SessionRecord>();

  return {
    async insertUser(user) {
      if (users.has(user.id)) throw new Error("Account id already exists.");
      if (user.email && [...users.values()].some((item) => item.email === user.email)) {
        throw new Error("Account email already exists.");
      }
      users.set(user.id, user);
    },
    async findUsers(ids) {
      const wanted = new Set(ids);
      return [...users.values()].filter((user) => wanted.has(user.id));
    },
    async findUser(id) {
      return users.get(id) ?? null;
    },
    async findUserByEmail(email) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async countRole(role) {
      return [...users.values()].filter((user) => user.role === role && user.status !== "closed").length;
    },
    async countStatus(status) {
      return [...users.values()].filter((user) => user.status === status).length;
    },
    async saveUser(user) {
      users.set(user.id, user);
    },
    async insertDevice(device) {
      devices.set(device.id, device);
    },
    async findDevice(id) {
      return devices.get(id) ?? null;
    },
    async saveDevice(device) {
      devices.set(device.id, device);
    },
    async insertSession(session) {
      sessions.set(session.id, session);
    },
    async findSessionById(id) {
      return sessions.get(id) ?? null;
    },
    async findSessionByAccessHash(hash) {
      return [...sessions.values()].find((session) => session.accessTokenHash === hash) ?? null;
    },
    async findSessionByRefreshHash(hash) {
      return [...sessions.values()].find((session) => session.refreshTokenHash === hash) ?? null;
    },
    async findSessionByPreviousRefreshHash(hash) {
      return [...sessions.values()].find((session) => session.previousRefreshTokenHash === hash) ?? null;
    },
    async saveSession(session) {
      sessions.set(session.id, session);
    },
    async listSessionsForUser(userId) {
      return [...sessions.values()]
        .filter((session) => session.userId === userId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    },
    async listDevicesForUser(userId) {
      return [...devices.values()]
        .filter((device) => device.userId === userId)
        .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime());
    },
    async revokeSessionsForUser(userId, revokedAt, reason: AccountRevokeReason) {
      for (const session of sessions.values()) {
        if (session.userId === userId && session.revokedAt === null) {
          sessions.set(session.id, { ...session, revokedAt, revokeReason: reason });
        }
      }
    },
    async revokeSessionsForUserExcept(userId, keepSessionId, revokedAt, reason: AccountRevokeReason) {
      for (const session of sessions.values()) {
        if (session.userId === userId && session.id !== keepSessionId && session.revokedAt === null) {
          sessions.set(session.id, { ...session, revokedAt, revokeReason: reason });
        }
      }
    },
    async expireSessions(now) {
      for (const session of sessions.values()) {
        if (session.revokedAt === null && session.refreshExpiresAt.getTime() <= now.getTime()) {
          sessions.set(session.id, { ...session, revokedAt: now, revokeReason: "expired" });
        }
      }
    },
  };
}
