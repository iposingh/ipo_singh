import type { NotificationPushState } from "@ipo-singh/contracts";
import type { NotificationKind, ScheduleSnapshot } from "./evaluate.ts";

export const notificationItemLimit = 100;

export type NotificationDelivery = {
  inApp: "delivered";
  push: NotificationPushState;
};

export type NotificationRecord = {
  id: string;
  userId: string;
  type: NotificationKind;
  ipoId: string | null;
  title: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  expiresAt: Date;
  dedupeKey: string;
  delivery: NotificationDelivery;
  /** Stored catalogue or announcement source. Omitted from the public notification response. */
  source: { name: string; observedAt: Date | null } | null;
};

export type ScheduleBaselineRecord = ScheduleSnapshot & {
  userId: string;
  seenAt: Date;
};

export type NotificationStore = {
  insertIfNew(record: NotificationRecord): Promise<"created" | "duplicate">;
  listForUser(userId: string, now: Date): Promise<NotificationRecord[]>;
  countUnread(userId: string, now: Date): Promise<number>;
  markRead(userId: string, id: string, now: Date): Promise<NotificationRecord | null>;
  markAllRead(userId: string, now: Date): Promise<number>;
  findBaseline(userId: string, ipoId: string): Promise<ScheduleBaselineRecord | null>;
  listBaselines(userIds: readonly string[]): Promise<ScheduleBaselineRecord[]>;
  saveBaseline(record: ScheduleBaselineRecord): Promise<void>;
  purge(userId: string, now: Date): Promise<void>;
  /** Notices that have not reached their expiry. */
  countStored(now: Date): Promise<number>;
  /** Oldest notices whose push attempt has not been decided. */
  listPushPending(now: Date, limit: number): Promise<NotificationRecord[]>;
  /** Records a push outcome once. A later call does not replace it. */
  setPushStatus(id: string, status: Exclude<NotificationPushState, "not-sent">): Promise<void>;
};
