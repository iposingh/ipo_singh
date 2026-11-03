import { accountIdSchema, type NotificationItem, type NotificationType } from "@ipo-singh/contracts";
import { issueRoute } from "../catalogue/routes.ts";

export const notificationCollectionPath = "/api/v1/notifications";
export const notificationUnreadPath = "/api/v1/notifications/unread-count";
export const notificationReadAllPath = "/api/v1/notifications/read-all";
export const notificationPreferencesPath = "/api/v1/notifications/preferences";

export const notificationTypeLabels = {
  open: "IPO opening",
  closing: "IPO closing soon",
  allotment: "Allotment dates",
  listing: "Listing dates",
  gmp: "GMP changes",
  subscription: "Subscription milestones",
  schedule: "Schedule changes",
  announcement: "IPO Singh announcements",
} as const satisfies Record<NotificationType, string>;

export function notificationPagePath(cursor?: string | null): string {
  if (!cursor) return notificationCollectionPath;
  return `${notificationCollectionPath}?cursor=${encodeURIComponent(cursor)}`;
}

export function notificationReadPath(id: string): string | null {
  const parsed = accountIdSchema.safeParse(id);
  if (!parsed.success) return null;
  return `${notificationCollectionPath}/${parsed.data}/read`;
}

export function dedupeNotifications(items: readonly NotificationItem[]): NotificationItem[] {
  const seen = new Set<string>();
  const unique: NotificationItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

export function appendNotifications(current: readonly NotificationItem[], next: readonly NotificationItem[]): NotificationItem[] {
  return dedupeNotifications([...current, ...next]);
}

export function markItemRead(items: readonly NotificationItem[], id: string, readAt: string): NotificationItem[] {
  return items.map((item) => (item.id === id && item.readAt === null ? { ...item, readAt } : item));
}

export function markItemsRead(items: readonly NotificationItem[], readAt: string): NotificationItem[] {
  return items.map((item) => (item.readAt === null ? { ...item, readAt } : item));
}

export function unreadAfterChange(count: number, removed: number): number {
  return Math.max(0, count - removed);
}

/** The stored IPO id is the detail route. An announcement has no IPO. */
export function notificationIssueRoute(ipoId: string | null): ReturnType<typeof issueRoute> {
  if (!ipoId) return null;
  return issueRoute(ipoId);
}

export function notificationStatusMessage(
  status: "ready" | "offline" | "signed-out" | "rejected" | "limited" | "unavailable",
  action: "load" | "change",
  message?: string,
): string | null {
  if (status === "ready") return null;
  if (status === "offline") {
    return action === "load"
      ? "Notifications could not be loaded while offline."
      : "Notifications could not be changed while offline.";
  }
  if (status === "signed-out") return "Sign in to read notifications.";
  return message ?? "Notifications could not be updated.";
}
