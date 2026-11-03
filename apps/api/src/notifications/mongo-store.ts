import { NotificationBaselineModel, NotificationModel } from "../db/models/notification.ts";
import { notificationItemLimit, type NotificationRecord, type NotificationStore } from "./records.ts";
import type { NotificationKind } from "./evaluate.ts";

type NotificationDoc = {
  _id: string;
  userId: string;
  type: NotificationKind;
  ipoId: string | null;
  title: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  expiresAt: Date;
  dedupeKey: string;
  inApp: "delivered";
  push: "not-sent" | "sent" | "failed" | "skipped";
  sourceName?: string | null;
  sourceObservedAt?: Date | null;
};

type BaselineDoc = {
  _id: string;
  userId: string;
  ipoId: string;
  openDate: string | null;
  closeDate: string | null;
  allotmentDate: string | null;
  listingDate: string | null;
  seenAt: Date;
};

function fromDoc(doc: NotificationDoc): NotificationRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    type: doc.type,
    ipoId: doc.ipoId ?? null,
    title: doc.title,
    body: doc.body,
    createdAt: doc.createdAt,
    readAt: doc.readAt ?? null,
    expiresAt: doc.expiresAt,
    dedupeKey: doc.dedupeKey,
    delivery: {
      inApp: "delivered",
      push: doc.push === "sent" || doc.push === "failed" || doc.push === "skipped" ? doc.push : "not-sent",
    },
    source: doc.sourceName ? { name: doc.sourceName, observedAt: doc.sourceObservedAt ?? null } : null,
  };
}

function duplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

function baselineId(userId: string, ipoId: string): string {
  return `${userId}:${ipoId}`;
}

export function createMongoNotificationStore(): NotificationStore {
  return {
    async insertIfNew(record) {
      try {
        await NotificationModel.create({
          _id: record.id,
          userId: record.userId,
          type: record.type,
          ipoId: record.ipoId,
          title: record.title,
          body: record.body,
          createdAt: record.createdAt,
          readAt: record.readAt,
          expiresAt: record.expiresAt,
          dedupeKey: record.dedupeKey,
          inApp: record.delivery.inApp,
          push: record.delivery.push,
          sourceName: record.source?.name ?? null,
          sourceObservedAt: record.source?.observedAt ?? null,
        });
        return "created";
      } catch (error) {
        if (duplicate(error)) return "duplicate";
        throw error;
      }
    },
    async listForUser(userId, now) {
      const docs = await NotificationModel.find({ userId, expiresAt: { $gt: now } })
        .sort({ createdAt: -1, _id: -1 })
        .limit(notificationItemLimit)
        .lean<NotificationDoc[]>();
      return docs.map(fromDoc);
    },
    async countUnread(userId, now) {
      const count = await NotificationModel.countDocuments({ userId, readAt: null, expiresAt: { $gt: now } });
      return Math.min(count, notificationItemLimit);
    },
    async markRead(userId, id, now) {
      const existing = await NotificationModel.findOne({ _id: id, userId, expiresAt: { $gt: now } }).lean<NotificationDoc | null>();
      if (!existing) return null;
      if (!existing.readAt) {
        await NotificationModel.updateOne({ _id: id, userId }, { $set: { readAt: now } });
        existing.readAt = now;
      }
      return fromDoc(existing);
    },
    async markAllRead(userId, now) {
      const result = await NotificationModel.updateMany({ userId, readAt: null, expiresAt: { $gt: now } }, { $set: { readAt: now } });
      return result.modifiedCount;
    },
    async listBaselines(userIds) {
      if (userIds.length === 0) return [];
      const docs = await NotificationBaselineModel.find({ userId: { $in: userIds.slice(0, 100) } }).limit(2_000).lean<BaselineDoc[]>();
      return docs.map((doc) => ({
        userId: doc.userId,
        ipoId: doc.ipoId,
        openDate: doc.openDate ?? null,
        closeDate: doc.closeDate ?? null,
        allotmentDate: doc.allotmentDate ?? null,
        listingDate: doc.listingDate ?? null,
        seenAt: doc.seenAt,
      }));
    },
    async findBaseline(userId, ipoId) {
      const doc = await NotificationBaselineModel.findOne({ userId, ipoId }).lean<BaselineDoc | null>();
      if (!doc) return null;
      return {
        userId: doc.userId,
        ipoId: doc.ipoId,
        openDate: doc.openDate ?? null,
        closeDate: doc.closeDate ?? null,
        allotmentDate: doc.allotmentDate ?? null,
        listingDate: doc.listingDate ?? null,
        seenAt: doc.seenAt,
      };
    },
    async saveBaseline(record) {
      await NotificationBaselineModel.updateOne(
        { userId: record.userId, ipoId: record.ipoId },
        {
          $set: {
            openDate: record.openDate,
            closeDate: record.closeDate,
            allotmentDate: record.allotmentDate,
            listingDate: record.listingDate,
            seenAt: record.seenAt,
          },
          $setOnInsert: { _id: baselineId(record.userId, record.ipoId), userId: record.userId, ipoId: record.ipoId },
        },
        { upsert: true },
      );
    },
    async countStored(now) {
      return NotificationModel.countDocuments({ expiresAt: { $gt: now } });
    },
    async purge(userId, now) {
      await NotificationModel.deleteMany({ userId, expiresAt: { $lte: now } });
      const extra = await NotificationModel.find({ userId, expiresAt: { $gt: now } })
        .sort({ createdAt: -1, _id: -1 })
        .skip(notificationItemLimit)
        .select("_id")
        .lean<Array<{ _id: string }>>();
      if (extra.length > 0) await NotificationModel.deleteMany({ _id: { $in: extra.map((doc) => doc._id) } });
    },
    async listPushPending(now, limit) {
      const bounded = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 1;
      const docs = await NotificationModel.find({ push: "not-sent", expiresAt: { $gt: now } })
        .sort({ createdAt: 1, _id: 1 })
        .limit(bounded)
        .lean<NotificationDoc[]>();
      return docs.map(fromDoc);
    },
    async setPushStatus(id, status) {
      await NotificationModel.updateOne({ _id: id, push: "not-sent" }, { $set: { push: status } });
    },
  };
}
