import {
  notificationListSchema,
  notificationSchema,
  publicAccountSchema,
  unreadNotificationCountSchema,
  updateAlertPreferencesSchema,
  type NotificationItem,
  type PublicAccount,
} from "@ipo-singh/contracts";
import { z } from "zod";
import type { AuthResult, AuthSession } from "../auth/session.ts";
import {
  appendNotifications,
  dedupeNotifications,
  markItemRead,
  markItemsRead,
  notificationPagePath,
  notificationPreferencesPath,
  notificationReadAllPath,
  notificationReadPath,
  notificationUnreadPath,
  unreadAfterChange,
} from "./inbox.ts";

export type AccountCaller = AuthSession["authorized"];

const markAllSchema = z.object({ marked: z.number().int().nonnegative() }).strict();
const preferenceBodySchema = z.object({ account: publicAccountSchema }).strict();

export type NotificationInboxState = {
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
};

export type NotificationInbox = {
  snapshot(): NotificationInboxState;
  loadUnread(): Promise<AuthResult<{ unreadCount: number }>>;
  loadFirst(): Promise<AuthResult<{ items: NotificationItem[]; page: { nextCursor: string | null } }>>;
  loadMore(): Promise<AuthResult<{ items: NotificationItem[]; page: { nextCursor: string | null } }>>;
  markRead(id: string, now: Date): Promise<AuthResult<NotificationItem>>;
  markAll(now: Date): Promise<AuthResult<{ marked: number }>>;
  saveAlerts(patch: unknown): Promise<AuthResult<PublicAccount>>;
};

function emptyInbox(): NotificationInboxState {
  return { items: [], nextCursor: null, unreadCount: 0 };
}

export async function saveAlertPreferences(call: AccountCaller, patch: unknown): Promise<AuthResult<PublicAccount>> {
  const parsed = updateAlertPreferencesSchema.safeParse(patch);
  if (!parsed.success) return { status: "rejected", message: "Those alert choices are not valid." };
  const result = await call({
    path: notificationPreferencesPath,
    schema: preferenceBodySchema,
    method: "PATCH",
    body: parsed.data,
  });
  if (result.status !== "ready") return result;
  return { status: "ready", value: result.value.account };
}

export function createNotificationInbox(call: AccountCaller): NotificationInbox {
  let state = emptyInbox();
  let chain = Promise.resolve();

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = chain.then(work, work);
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  function settle(result: AuthResult<unknown>, previous: NotificationInboxState): void {
    state = result.status === "signed-out" ? emptyInbox() : previous;
  }

  return {
    snapshot: () => state,
    loadUnread() {
      return enqueue(async () => {
        const result = await call({ path: notificationUnreadPath, schema: unreadNotificationCountSchema });
        if (result.status === "ready") state = { ...state, unreadCount: result.value.unreadCount };
        if (result.status === "signed-out") state = emptyInbox();
        return result;
      });
    },
    loadFirst() {
      return enqueue(async () => {
        const result = await call({ path: notificationPagePath(null), schema: notificationListSchema });
        if (result.status === "ready") {
          state = { ...state, items: dedupeNotifications(result.value.items), nextCursor: result.value.page.nextCursor };
        }
        if (result.status === "signed-out") state = emptyInbox();
        return result;
      });
    },
    loadMore() {
      return enqueue(async () => {
        if (!state.nextCursor) {
          return { status: "ready", value: { items: state.items, page: { nextCursor: null } } };
        }
        const previous = state;
        const result = await call({ path: notificationPagePath(state.nextCursor), schema: notificationListSchema });
        if (result.status !== "ready") {
          if (result.status === "signed-out") state = emptyInbox();
          return result;
        }
        state = {
          ...previous,
          items: appendNotifications(previous.items, result.value.items),
          nextCursor: result.value.page.nextCursor,
        };
        return { status: "ready", value: { items: state.items, page: { nextCursor: state.nextCursor } } };
      });
    },
    markRead(id, now) {
      return enqueue(async () => {
        const path = notificationReadPath(id);
        if (!path) return { status: "rejected", message: "Choose a notification." };
        const previous = state;
        const target = state.items.find((item) => item.id === id);
        state = {
          ...state,
          items: markItemRead(state.items, id, now.toISOString()),
          unreadCount: target?.readAt === null ? unreadAfterChange(state.unreadCount, 1) : state.unreadCount,
        };
        const result = await call({ path, schema: notificationSchema, method: "POST" });
        if (result.status !== "ready") {
          settle(result, previous);
          return result;
        }
        state = { ...state, items: state.items.map((item) => (item.id === result.value.id ? result.value : item)) };
        return result;
      });
    },
    markAll(now) {
      return enqueue(async () => {
        const previous = state;
        state = { ...state, items: markItemsRead(state.items, now.toISOString()), unreadCount: 0 };
        const result = await call({ path: notificationReadAllPath, schema: markAllSchema, method: "POST" });
        if (result.status !== "ready") settle(result, previous);
        return result;
      });
    },
    saveAlerts(patch) {
      return enqueue(async () => {
        const result = await saveAlertPreferences(call, patch);
        if (result.status === "signed-out") state = emptyInbox();
        return result;
      });
    },
  };
}
