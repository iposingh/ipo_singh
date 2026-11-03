import { notificationItemLimit, type NotificationRecord, type NotificationStore, type ScheduleBaselineRecord } from "./records.ts";

function active(record: NotificationRecord, userId: string, now: Date): boolean {
  return record.userId === userId && record.expiresAt.getTime() > now.getTime();
}

export function createMemoryNotificationStore(): NotificationStore {
  const items = new Map<string, NotificationRecord>();
  const keys = new Map<string, string>();
  const baselines = new Map<string, ScheduleBaselineRecord>();

  function rows(userId: string, now: Date): NotificationRecord[] {
    return [...items.values()]
      .filter((record) => active(record, userId, now))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id));
  }

  return {
    async insertIfNew(record) {
      const key = `${record.userId}\0${record.dedupeKey}`;
      if (keys.has(key)) return "duplicate";
      items.set(record.id, record);
      keys.set(key, record.id);
      return "created";
    },
    async listForUser(userId, now) {
      return rows(userId, now);
    },
    async countUnread(userId, now) {
      return rows(userId, now).filter((record) => record.readAt === null).length;
    },
    async markRead(userId, id, now) {
      const record = items.get(id);
      if (!record || record.userId !== userId || record.expiresAt.getTime() <= now.getTime()) return null;
      if (!record.readAt) record.readAt = now;
      return record;
    },
    async markAllRead(userId, now) {
      let marked = 0;
      for (const record of rows(userId, now)) {
        if (record.readAt) continue;
        record.readAt = now;
        marked += 1;
      }
      return marked;
    },
    async listBaselines(userIds) {
      const wanted = new Set(userIds);
      return [...baselines.values()].filter((record) => wanted.has(record.userId));
    },
    async findBaseline(userId, ipoId) {
      return baselines.get(`${userId}\0${ipoId}`) ?? null;
    },
    async saveBaseline(record) {
      baselines.set(`${record.userId}\0${record.ipoId}`, record);
    },
    async countStored(now) {
      return [...items.values()].filter((record) => record.expiresAt.getTime() > now.getTime()).length;
    },
    async listPushPending(now, limit) {
      const bounded = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 1;
      return [...items.values()]
        .filter((record) => record.delivery.push === "not-sent" && record.expiresAt.getTime() > now.getTime())
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
        .slice(0, bounded);
    },
    async setPushStatus(id, status) {
      const record = items.get(id);
      if (!record || record.delivery.push !== "not-sent") return;
      record.delivery.push = status;
    },
    async purge(userId, now) {
      for (const [id, record] of items) {
        if (record.userId === userId && record.expiresAt.getTime() <= now.getTime()) {
          items.delete(id);
          keys.delete(`${record.userId}\0${record.dedupeKey}`);
        }
      }
      const kept = rows(userId, now);
      if (kept.length <= notificationItemLimit) return;
      const overflow = kept.slice(notificationItemLimit);
      for (const record of overflow) {
        items.delete(record.id);
        keys.delete(`${record.userId}\0${record.dedupeKey}`);
      }
    },
  };
}
