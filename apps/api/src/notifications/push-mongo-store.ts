import { PushAttemptModel, PushTokenModel } from "../db/models/push-token.ts";
import type { PushAttemptStatus, PushOwnerKind, PushPlatform, PushTokenRecord, PushTokenStatus, PushTokenStore } from "./push-records.ts";

type TokenDoc = {
  _id: string;
  userId: string;
  deviceId: string;
  platform: PushPlatform;
  token: string;
  status: PushTokenStatus;
  ownerKind?: PushOwnerKind;
  allotmentAlertsEnabled?: boolean;
  mainboardGlobalAlerts?: boolean;
  smeWatchlistAlerts?: boolean;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt?: Date | null;
  invalidAt?: Date | null;
};

type AttemptDoc = {
  _id: string;
  notificationId: string;
  tokenId: string;
  userId: string;
  attempt: number;
  status: PushAttemptStatus;
  providerError?: string | null;
  ticketId?: string | null;
  receiptCheckedAt?: Date | null;
  createdAt: Date;
};

function attemptFrom(doc: AttemptDoc) {
  return {
    id: doc._id,
    notificationId: doc.notificationId,
    tokenId: doc.tokenId,
    userId: doc.userId,
    attempt: doc.attempt,
    status: doc.status,
    providerError: doc.providerError ?? null,
    ticketId: doc.ticketId ?? null,
    receiptCheckedAt: doc.receiptCheckedAt ?? null,
    createdAt: doc.createdAt,
  };
}

function tokenFrom(doc: TokenDoc): PushTokenRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    deviceId: doc.deviceId,
    platform: doc.platform,
    token: doc.token,
    status: doc.status,
    ownerKind: doc.ownerKind ?? "user",
    allotmentAlertsEnabled: doc.allotmentAlertsEnabled ?? true,
    mainboardGlobalAlerts: doc.mainboardGlobalAlerts ?? false,
    smeWatchlistAlerts: doc.smeWatchlistAlerts ?? false,
    createdAt: doc.createdAt,
    lastSeenAt: doc.lastSeenAt,
    revokedAt: doc.revokedAt ?? null,
    invalidAt: doc.invalidAt ?? null,
  };
}

function duplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export function createMongoPushTokenStore(): PushTokenStore {
  return {
    async findByToken(token) {
      const doc = await PushTokenModel.findOne({ token }).lean<TokenDoc | null>();
      return doc ? tokenFrom(doc) : null;
    },
    async insert(record) {
      await PushTokenModel.create({
        _id: record.id,
        userId: record.userId,
        deviceId: record.deviceId,
        platform: record.platform,
        token: record.token,
        status: record.status,
        ownerKind: record.ownerKind,
        allotmentAlertsEnabled: record.allotmentAlertsEnabled,
        mainboardGlobalAlerts: record.mainboardGlobalAlerts,
        smeWatchlistAlerts: record.smeWatchlistAlerts,
        createdAt: record.createdAt,
        lastSeenAt: record.lastSeenAt,
        revokedAt: record.revokedAt,
        invalidAt: record.invalidAt,
      });
    },
    async save(record) {
      await PushTokenModel.updateOne(
        { _id: record.id },
        {
          $set: {
            userId: record.userId,
            deviceId: record.deviceId,
            platform: record.platform,
            token: record.token,
            status: record.status,
            ownerKind: record.ownerKind,
            allotmentAlertsEnabled: record.allotmentAlertsEnabled,
            mainboardGlobalAlerts: record.mainboardGlobalAlerts,
            smeWatchlistAlerts: record.smeWatchlistAlerts,
            lastSeenAt: record.lastSeenAt,
            revokedAt: record.revokedAt,
            invalidAt: record.invalidAt,
          },
        },
      );
    },
    async listActive(userId) {
      const docs = await PushTokenModel.find({ userId, status: "active" })
        .sort({ lastSeenAt: -1, _id: -1 })
        .limit(20)
        .lean<TokenDoc[]>();
      return docs.map(tokenFrom);
    },
    async listActiveUserIds(limit = 10_000) {
      const capped = Math.min(Math.max(limit, 1), 50_000);
      const docs = await PushTokenModel.aggregate<{ _id: string }>([
        { $match: { status: "active" } },
        { $group: { _id: "$userId" } },
        { $sort: { _id: 1 } },
        { $limit: capped },
      ]);
      return docs.map((doc) => doc._id);
    },
    async listActiveOwnerIds(afterId, limit) {
      const capped = Math.min(Math.max(limit, 1), 500);
      const docs = await PushTokenModel.aggregate<{ _id: string }>([
        { $match: { status: "active" } },
        { $group: { _id: "$userId" } },
        ...(afterId ? [{ $match: { _id: { $gt: afterId } } }] : []),
        { $sort: { _id: 1 } },
        { $limit: capped },
      ]);
      return docs.map((doc) => doc._id);
    },
    async revokeActive(input) {
      const filter: { userId: string; status: "active"; deviceId?: string | { $ne: string } } = {
        userId: input.userId,
        status: "active",
      };
      if (input.deviceId) filter.deviceId = input.deviceId;
      else if (input.exceptDeviceId) filter.deviceId = { $ne: input.exceptDeviceId };
      const result = await PushTokenModel.updateMany(filter, { $set: { status: "revoked", revokedAt: new Date() } });
      return result.modifiedCount;
    },
    async attemptsFor(notificationId, tokenId) {
      const docs = await PushAttemptModel.find({ notificationId, tokenId }).sort({ attempt: 1 }).limit(10).lean<AttemptDoc[]>();
      return docs.map(attemptFrom);
    },
    async recordAttempt(record) {
      try {
        await PushAttemptModel.create({
          _id: record.id,
          notificationId: record.notificationId,
          tokenId: record.tokenId,
          userId: record.userId,
          attempt: record.attempt,
          status: record.status,
          providerError: record.providerError,
          ticketId: record.ticketId,
          receiptCheckedAt: record.receiptCheckedAt,
          createdAt: record.createdAt,
        });
      } catch (error) {
        if (duplicate(error)) return;
        throw error;
      }
    },
    async listPendingReceipts(limit) {
      const capped = Math.min(Math.max(limit, 1), 500);
      const docs = await PushAttemptModel.find({
        status: "sent",
        ticketId: { $ne: null },
        receiptCheckedAt: null,
      })
        .sort({ createdAt: 1 })
        .limit(capped)
        .lean<AttemptDoc[]>();
      return docs.map(attemptFrom);
    },
    async markReceiptChecked(attemptId, checkedAt) {
      await PushAttemptModel.updateOne({ _id: attemptId }, { $set: { receiptCheckedAt: checkedAt } });
    },
    async findTokenById(tokenId) {
      const doc = await PushTokenModel.findById(tokenId).lean<TokenDoc | null>();
      return doc ? tokenFrom(doc) : null;
    },
  };
}
