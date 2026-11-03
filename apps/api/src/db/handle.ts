import type { AdminAuditStore } from "../accounts/audit.ts";
import type { AccountStore } from "../accounts/records.ts";
import type { NotificationStore } from "../notifications/records.ts";
import type { PushTokenStore } from "../notifications/push-records.ts";
import type { WatchlistStore } from "../watchlist/records.ts";
import type { ArticleStore } from "../content/records.ts";
import type { PromotionStore } from "../promotions/records.ts";
import type { PersistenceStore } from "./repositories.ts";

export type DatabaseCheck = "not_configured" | "ok" | "unavailable";

export type DatabaseHandle = {
  check: () => Promise<DatabaseCheck>;
  close: () => Promise<void>;
  /** Present only after a database connection has been opened. */
  readonly store?: PersistenceStore;
  /** Account documents. Present only after a database connection has been opened. */
  readonly accounts?: AccountStore;
  /** Saved IPO ids. Present only after a database connection has been opened. */
  readonly watchlist?: WatchlistStore;
  /** In-app notifications. Present only after a database connection has been opened. */
  readonly notifications?: NotificationStore;
  /** Device push tokens. Present only after a database connection has been opened. */
  readonly pushTokens?: PushTokenStore;
  /** Administrator actions. Present only after a database connection has been opened. */
  readonly adminAudit?: AdminAuditStore;
  /** Promotional banners. Present only after a database connection has been opened. */
  readonly promotions?: PromotionStore;
  /** Editorial articles. Falls back to the seeded in-memory catalogue when absent. */
  readonly articles?: ArticleStore;
};

export const unconfiguredDatabase: DatabaseHandle = {
  async check() {
    return "not_configured";
  },
  async close() {
    return undefined;
  },
};
