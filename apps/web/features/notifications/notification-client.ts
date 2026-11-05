"use client";

import {
  accountSessionResponseSchema,
  notificationListSchema,
  notificationSchema,
  unreadNotificationCountSchema,
  type AccountPreferences,
  type NotificationItem,
} from "@ipo-singh/contracts";
import { hasBrowserAuthHint } from "@/features/auth/browser-auth-hint";
import { readCsrfToken } from "@/features/auth/csrf";

export function notificationHeaders(): Headers {
  const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
  const csrf = readCsrfToken(document.cookie);
  if (csrf) headers.set("x-csrf-token", csrf);
  return headers;
}

async function refreshOnce(): Promise<boolean> {
  if (!readCsrfToken(document.cookie)) return false;
  const refreshed = await fetch("/api/auth/refresh", { method: "POST", headers: notificationHeaders(), cache: "no-store" });
  return refreshed.ok;
}

export async function readNotificationPage(cursor?: string | null): Promise<"guest" | "error" | { items: NotificationItem[]; nextCursor: string | null }> {
  if (!hasBrowserAuthHint()) return "guest";
  const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  let response = await fetch(`/api/notifications${search}`, { headers: { accept: "application/json" }, cache: "no-store" });
  if (response.status === 401 && (await refreshOnce())) {
    response = await fetch(`/api/notifications${search}`, { headers: { accept: "application/json" }, cache: "no-store" });
  }
  if (response.status === 401) return "guest";
  const parsed = notificationListSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) return "error";
  return { items: parsed.data.items, nextCursor: parsed.data.page.nextCursor };
}

export async function readUnreadCount(): Promise<number | "guest" | "error"> {
  if (!hasBrowserAuthHint()) return "guest";
  let response = await fetch("/api/notifications/unread-count", { headers: { accept: "application/json" }, cache: "no-store" });
  if (response.status === 401 && (await refreshOnce())) {
    response = await fetch("/api/notifications/unread-count", { headers: { accept: "application/json" }, cache: "no-store" });
  }
  if (response.status === 401) return "guest";
  const parsed = unreadNotificationCountSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) return "error";
  return parsed.data.unreadCount;
}

function announceNotificationChange(): void {
  window.dispatchEvent(new Event("ipo-singh-notifications"));
}

export async function markNotificationRead(id: string): Promise<NotificationItem | null> {
  const response = await fetch(`/api/notifications/${id}/read`, { method: "POST", headers: notificationHeaders() });
  const parsed = notificationSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) return null;
  announceNotificationChange();
  return parsed.data;
}

export async function markAllNotificationsRead(): Promise<boolean> {
  const response = await fetch("/api/notifications/read-all", { method: "POST", headers: notificationHeaders() });
  if (response.ok) announceNotificationChange();
  return response.ok;
}

export async function readAlertPreferences(): Promise<AccountPreferences | "guest" | "error"> {
  if (!hasBrowserAuthHint()) return "guest";
  const response = await fetch("/api/auth/session", { headers: { accept: "application/json" }, cache: "no-store" });
  if (response.status === 401) return "guest";
  const parsed = accountSessionResponseSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) return "error";
  return parsed.data.account.preferences;
}

export async function saveAlertPreferences(patch: { alertsEnabled?: boolean; notificationCategories?: Partial<AccountPreferences["notificationCategories"]> }): Promise<AccountPreferences | null> {
  const response = await fetch("/api/notifications/preferences", {
    method: "PATCH",
    headers: notificationHeaders(),
    body: JSON.stringify(patch),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object" || !("account" in payload)) return null;
  const parsed = accountSessionResponseSchema.shape.account.safeParse(payload.account);
  return parsed.success ? parsed.data.preferences : null;
}
