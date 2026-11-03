import type { WatchlistRecord, WatchlistStore } from "./records.ts";

export function createMemoryWatchlistStore(): WatchlistStore {
  const rows = new Map<string, WatchlistRecord>();
  const key = (userId: string, ipoId: string) => `${userId}\u0000${ipoId}`;

  return {
    async listBatch(afterId, limit) {
      return [...rows.values()]
        .filter((row) => afterId === null || row.id > afterId)
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
        .slice(0, limit);
    },
    async listForUser(userId) {
      return [...rows.values()]
        .filter((row) => row.userId === userId)
        .sort((left, right) => right.addedAt.getTime() - left.addedAt.getTime());
    },
    async listByIpo(ipoId, limit = 500) {
      return [...rows.values()]
        .filter((row) => row.ipoId === ipoId)
        .sort((left, right) => right.addedAt.getTime() - left.addedAt.getTime())
        .slice(0, Math.min(Math.max(limit, 1), 2_000));
    },
    async find(userId, ipoId) {
      return rows.get(key(userId, ipoId)) ?? null;
    },
    async save(record, noteProvided) {
      const existing = rows.get(key(record.userId, record.ipoId));
      if (existing) {
        const next = noteProvided ? { ...existing, note: record.note } : existing;
        rows.set(key(record.userId, record.ipoId), next);
        return next;
      }
      rows.set(key(record.userId, record.ipoId), record);
      return record;
    },
    async remove(userId, ipoId) {
      return rows.delete(key(userId, ipoId));
    },
    async countAll() {
      return rows.size;
    },
  };
}
