import type { AdminAuditAction } from "@ipo-singh/contracts";

export type AdminAuditRecord = {
  id: string;
  actorUserId: string;
  action: AdminAuditAction;
  outcome: "succeeded" | "denied";
  targetUserId: string | null;
  createdAt: Date;
};

export type AdminAuditStore = {
  insert(record: AdminAuditRecord): Promise<void>;
  listRecent(limit: number): Promise<AdminAuditRecord[]>;
};

const memoryLimit = 200;

export function createMemoryAdminAuditStore(): AdminAuditStore {
  const events: AdminAuditRecord[] = [];
  return {
    async insert(record) {
      events.unshift(record);
      if (events.length > memoryLimit) events.length = memoryLimit;
    },
    async listRecent(limit) {
      return events.slice(0, Math.min(Math.max(limit, 0), 50));
    },
  };
}
