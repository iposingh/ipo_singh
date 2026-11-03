export type RetentionPolicy = {
  gmpDays: number;
  subscriptionDays: number;
  syncHistoryDays: number;
  providerUsageDays: number;
};

export const defaultRetention: RetentionPolicy = {
  gmpDays: 400,
  subscriptionDays: 400,
  syncHistoryDays: 90,
  providerUsageDays: 90,
};

/** Catalogue records stay until replaced. Observations and usage logs expire. */
export function retentionExpiry(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
