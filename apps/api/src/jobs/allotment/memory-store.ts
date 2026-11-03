import type { AllotmentVerificationStore, StoredAllotmentVerification } from "./records.ts";

export function createMemoryAllotmentVerificationStore(): AllotmentVerificationStore {
  const rows = new Map<string, StoredAllotmentVerification>();
  return {
    async upsert(record) {
      rows.set(record.ipoId, record);
      return record;
    },
    async findByIpo(ipoId) {
      return rows.get(ipoId) ?? null;
    },
    async list(limit = 200) {
      return [...rows.values()].sort((left, right) => right.lastCheckedAt.localeCompare(left.lastCheckedAt)).slice(0, limit);
    },
  };
}
