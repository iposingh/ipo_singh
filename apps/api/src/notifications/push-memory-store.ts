import type { PushAttemptRecord, PushTokenRecord, PushTokenStore } from "./push-records.ts";

function withDefaults(record: PushTokenRecord): PushTokenRecord {
  return {
    ...record,
    ownerKind: record.ownerKind ?? "user",
    allotmentAlertsEnabled: record.allotmentAlertsEnabled ?? true,
    mainboardGlobalAlerts: record.mainboardGlobalAlerts ?? false,
    smeWatchlistAlerts: record.smeWatchlistAlerts ?? false,
  };
}

export function createMemoryPushTokenStore(): PushTokenStore {
  const tokens = new Map<string, PushTokenRecord>();
  const attempts = new Map<string, PushAttemptRecord>();

  return {
    async findByToken(token) {
      const found = [...tokens.values()].find((record) => record.token === token) ?? null;
      return found ? withDefaults(found) : null;
    },
    async insert(record) {
      if (tokens.has(record.id)) throw new Error("Push token id already exists.");
      if ([...tokens.values()].some((item) => item.token === record.token)) throw new Error("Push token already exists.");
      tokens.set(record.id, withDefaults(record));
    },
    async save(record) {
      const current = [...tokens.values()].find((item) => item.token === record.token && item.id !== record.id);
      if (current) tokens.delete(current.id);
      tokens.set(record.id, withDefaults(record));
    },
    async listActive(userId) {
      return [...tokens.values()]
        .filter((record) => record.userId === userId && record.status === "active")
        .map(withDefaults)
        .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime() || right.id.localeCompare(left.id));
    },
    async listActiveUserIds(limit = 10_000) {
      const ids = [...new Set([...tokens.values()].filter((record) => record.status === "active").map((record) => record.userId))];
      return ids.sort().slice(0, Math.min(Math.max(limit, 1), 50_000));
    },
    async listActiveOwnerIds(afterId, limit) {
      const ids = [...new Set([...tokens.values()].filter((record) => record.status === "active").map((record) => record.userId))].sort();
      const start = afterId ? ids.findIndex((id) => id > afterId) : 0;
      if (afterId && start < 0) return [];
      const from = Math.max(start, 0);
      return ids.slice(from, from + Math.min(Math.max(limit, 1), 500));
    },
    async revokeActive(input) {
      const now = new Date();
      let revoked = 0;
      for (const record of tokens.values()) {
        if (record.userId !== input.userId || record.status !== "active") continue;
        if (input.exceptDeviceId && record.deviceId === input.exceptDeviceId) continue;
        if (input.deviceId && record.deviceId !== input.deviceId) continue;
        record.status = "revoked";
        record.revokedAt = now;
        revoked += 1;
      }
      return revoked;
    },
    async attemptsFor(notificationId, tokenId) {
      return [...attempts.values()]
        .filter((record) => record.notificationId === notificationId && record.tokenId === tokenId)
        .sort((left, right) => left.attempt - right.attempt);
    },
    async recordAttempt(record) {
      const key = `${record.notificationId}\0${record.tokenId}\0${record.attempt}`;
      if ([...attempts.values()].some((item) => item.notificationId === record.notificationId && item.tokenId === record.tokenId && item.attempt === record.attempt)) {
        return;
      }
      attempts.set(key, {
        ...record,
        ticketId: record.ticketId ?? null,
        receiptCheckedAt: record.receiptCheckedAt ?? null,
      });
    },
    async listPendingReceipts(limit) {
      return [...attempts.values()]
        .filter((record) => record.status === "sent" && record.ticketId && !record.receiptCheckedAt)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .slice(0, Math.min(Math.max(limit, 1), 500));
    },
    async markReceiptChecked(attemptId, checkedAt) {
      for (const [key, record] of attempts) {
        if (record.id !== attemptId) continue;
        attempts.set(key, { ...record, receiptCheckedAt: checkedAt });
        return;
      }
    },
    async findTokenById(tokenId) {
      const found = tokens.get(tokenId) ?? null;
      return found ? withDefaults(found) : null;
    },
  };
}
