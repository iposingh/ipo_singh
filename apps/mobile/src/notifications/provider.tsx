import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NotificationItem } from "@ipo-singh/contracts";
import type { AuthResult } from "../auth/session";
import { useAuth } from "../auth/provider";
import { createNotificationInbox, type NotificationInbox } from "./controller";
import { notificationStatusMessage } from "./inbox";

type InboxStatus = "loading" | "guest" | "offline" | "ready" | "error";

type InboxModel = {
  userId: string | null;
  status: InboxStatus;
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
  notice: string | null;
  refreshing: boolean;
  loadingMore: boolean;
};

type InboxContextValue = {
  status: InboxStatus;
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
  notice: string | null;
  refreshing: boolean;
  loadingMore: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<string | null>;
  markAll: () => Promise<string | null>;
};

const InboxContext = createContext<InboxContextValue | null>(null);

function resultMessage(result: AuthResult<unknown>): string | undefined {
  return "message" in result ? result.message : undefined;
}

function inboxStatus(status: AuthResult<unknown>["status"], items: readonly NotificationItem[]): InboxStatus {
  if (status === "ready") return "ready";
  if (status === "signed-out") return "guest";
  if (status === "offline") return items.length > 0 ? "ready" : "offline";
  return items.length > 0 ? "ready" : "error";
}

const initialModel: InboxModel = {
  userId: null,
  status: "loading",
  items: [],
  nextCursor: null,
  unreadCount: 0,
  notice: null,
  refreshing: false,
  loadingMore: false,
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const callerRef = useRef(auth.call);
  const phase = auth.state.phase;
  const userId = phase === "ready" ? auth.state.snapshot.account.id : null;
  const inboxRef = useRef<NotificationInbox | null>(null);
  const userRef = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [model, setModel] = useState<InboxModel>(initialModel);

  useEffect(() => {
    callerRef.current = auth.call;
  }, [auth.call]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      if (!userId) {
        userRef.current = null;
        inboxRef.current = null;
        if (phase === "offline") {
          setModel((current) => ({
            ...current,
            userId: null,
            status: current.items.length > 0 ? "ready" : "offline",
            notice: "Notifications could not be loaded while offline.",
            refreshing: false,
            loadingMore: false,
          }));
          return;
        }
        setModel({ ...initialModel, status: phase === "loading" ? "loading" : "guest" });
        return;
      }
      if (userRef.current !== userId) {
        userRef.current = userId;
        inboxRef.current = createNotificationInbox((input) => callerRef.current(input));
      }
      const inbox = inboxRef.current;
      if (!inbox) return;
      const result = await inbox.loadUnread();
      if (!active || userRef.current !== userId) return;
      const snapshot = inbox.snapshot();
      setModel({
        userId,
        status: inboxStatus(result.status, snapshot.items),
        items: snapshot.items,
        nextCursor: snapshot.nextCursor,
        unreadCount: snapshot.unreadCount,
        notice: notificationStatusMessage(result.status, "load", resultMessage(result)),
        refreshing: false,
        loadingMore: false,
      });
    })();
    return () => {
      active = false;
    };
  }, [attempt, phase, userId]);

  const value = useMemo<InboxContextValue>(() => {
    const status: InboxStatus = phase === "loading" || (userId !== null && model.userId !== userId)
      ? "loading"
      : !userId && phase === "offline"
        ? (model.items.length > 0 ? "ready" : "offline")
        : !userId
          ? "guest"
          : model.status;

    function publish(owner: string, inbox: NotificationInbox, result: AuthResult<unknown>, action: "load" | "change", loadingMore = false) {
      if (userRef.current !== owner) return notificationStatusMessage(result.status, action, resultMessage(result));
      const snapshot = inbox.snapshot();
      const message = notificationStatusMessage(result.status, action, resultMessage(result));
      setModel({
        userId: owner,
        status: inboxStatus(result.status, snapshot.items),
        items: snapshot.items,
        nextCursor: snapshot.nextCursor,
        unreadCount: snapshot.unreadCount,
        notice: message,
        refreshing: false,
        loadingMore,
      });
      return message;
    }

    return {
      status,
      items: status === "guest" || status === "loading" ? [] : model.items,
      nextCursor: status === "guest" || status === "loading" ? null : model.nextCursor,
      unreadCount: status === "ready" ? model.unreadCount : 0,
      notice: status === "guest" || status === "loading" ? null : model.notice,
      refreshing: model.refreshing,
      loadingMore: model.loadingMore,
      async reload() {
        const inbox = inboxRef.current;
        const owner = userRef.current;
        if (!inbox || !owner) {
          setAttempt((current) => current + 1);
          return;
        }
        setModel((current) => ({ ...current, refreshing: true }));
        const page = await inbox.loadFirst();
        if (page.status === "signed-out") {
          publish(owner, inbox, page, "load");
          return;
        }
        const count = await inbox.loadUnread();
        publish(owner, inbox, page.status === "ready" ? page : count.status === "ready" ? page : page, "load");
      },
      async loadMore() {
        const inbox = inboxRef.current;
        const owner = userRef.current;
        if (!inbox || !owner || !inbox.snapshot().nextCursor) return;
        setModel((current) => ({ ...current, loadingMore: true }));
        const result = await inbox.loadMore();
        publish(owner, inbox, result, "load");
      },
      async markRead(id) {
        const inbox = inboxRef.current;
        const owner = userRef.current;
        if (!inbox || !owner) return notificationStatusMessage(phase === "offline" ? "offline" : "signed-out", "change");
        return publish(owner, inbox, await inbox.markRead(id, new Date()), "change");
      },
      async markAll() {
        const inbox = inboxRef.current;
        const owner = userRef.current;
        if (!inbox || !owner) return notificationStatusMessage(phase === "offline" ? "offline" : "signed-out", "change");
        return publish(owner, inbox, await inbox.markAll(new Date()), "change");
      },
    };
  }, [model, phase, userId]);

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useNotifications(): InboxContextValue {
  const value = useContext(InboxContext);
  if (!value) throw new Error("Notifications are unavailable.");
  return value;
}
