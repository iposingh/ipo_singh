import { WatchlistModel } from "../db/models/watchlist.ts";
import type { WatchlistRecord, WatchlistStore } from "./records.ts";

type WatchlistDoc = {
  _id: string;
  userId: string;
  ipoId: string;
  addedAt: Date;
  note: string | null;
};

function fromDoc(doc: WatchlistDoc): WatchlistRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    ipoId: doc.ipoId,
    addedAt: doc.addedAt,
    note: doc.note ?? null,
  };
}

function duplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export function createMongoWatchlistStore(): WatchlistStore {
  return {
    async listBatch(afterId, limit) {
      const filter = afterId ? { _id: { $gt: afterId } } : {};
      const docs = await WatchlistModel.find(filter).sort({ _id: 1 }).limit(limit).lean<WatchlistDoc[]>();
      return docs.map(fromDoc);
    },
    async listForUser(userId) {
      const docs = await WatchlistModel.find({ userId }).sort({ addedAt: -1 }).limit(200).lean<WatchlistDoc[]>();
      return docs.map(fromDoc);
    },
    async listByIpo(ipoId, limit = 500) {
      const docs = await WatchlistModel.find({ ipoId })
        .sort({ addedAt: -1 })
        .limit(Math.min(Math.max(limit, 1), 2_000))
        .lean<WatchlistDoc[]>();
      return docs.map(fromDoc);
    },
    async find(userId, ipoId) {
      const doc = await WatchlistModel.findOne({ userId, ipoId }).lean<WatchlistDoc | null>();
      return doc ? fromDoc(doc) : null;
    },
    async save(record, noteProvided) {
      try {
        const created = await WatchlistModel.create({
          _id: record.id,
          userId: record.userId,
          ipoId: record.ipoId,
          addedAt: record.addedAt,
          note: record.note,
        });
        return fromDoc(created.toObject());
      } catch (error) {
        if (!duplicate(error)) throw error;
        if (noteProvided) {
          await WatchlistModel.updateOne({ userId: record.userId, ipoId: record.ipoId }, { $set: { note: record.note } });
        }
        const existing = await WatchlistModel.findOne({ userId: record.userId, ipoId: record.ipoId }).lean<WatchlistDoc | null>();
        if (!existing) throw error;
        return fromDoc(existing);
      }
    },
    async remove(userId, ipoId) {
      const result = await WatchlistModel.deleteOne({ userId, ipoId });
      return result.deletedCount === 1;
    },
    async countAll() {
      return WatchlistModel.countDocuments();
    },
  };
}
