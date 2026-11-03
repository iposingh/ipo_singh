import type { AdminAuditAction } from "@ipo-singh/contracts";
import { AdminAuditModel } from "../db/models/admin-audit.ts";
import type { AdminAuditRecord, AdminAuditStore } from "./audit.ts";

type AuditDoc = {
  _id: string;
  actorUserId: string;
  action: AdminAuditAction;
  outcome: "succeeded" | "denied";
  targetUserId: string | null;
  createdAt: Date;
};

function fromDoc(doc: AuditDoc): AdminAuditRecord {
  return {
    id: doc._id,
    actorUserId: doc.actorUserId,
    action: doc.action,
    outcome: doc.outcome,
    targetUserId: doc.targetUserId,
    createdAt: doc.createdAt,
  };
}

export function createMongoAdminAuditStore(): AdminAuditStore {
  return {
    async insert(record) {
      await AdminAuditModel.create({
        _id: record.id,
        actorUserId: record.actorUserId,
        action: record.action,
        outcome: record.outcome,
        targetUserId: record.targetUserId,
        createdAt: record.createdAt,
      });
    },
    async listRecent(limit) {
      const docs = await AdminAuditModel.find()
        .sort({ createdAt: -1 })
        .limit(Math.min(Math.max(limit, 0), 50))
        .lean<AuditDoc[]>();
      return docs.map(fromDoc);
    },
  };
}
