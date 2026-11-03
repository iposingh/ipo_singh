"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { IstDateTime } from "@/components/financial/ist-date-time";
import { markNotificationRead, readNotificationPage, readUnreadCount } from "@/features/notifications/notification-client";
import type { NotificationItem } from "@ipo-singh/contracts";

export function NotificationBell() {
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [guest, setGuest] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState(false);
  const [panelReady, setPanelReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      void readUnreadCount().then((count) => {
        if (cancelled) return;
        if (count === "guest") {
          setGuest(true);
          return;
        }
        if (count === "error") {
          setError(true);
          return;
        }
        setUnread(count);
      });
    }
    refresh();
    window.addEventListener("ipo-singh-notifications", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("ipo-singh-notifications", refresh);
    };
  }, []);

  useEffect(() => {
    if (!open || guest) return;
    let cancelled = false;
    void readNotificationPage().then((page) => {
      if (cancelled) return;
      if (page === "guest") {
        setGuest(true);
        setItems([]);
        return;
      }
      if (page === "error") {
        setError(true);
        setPanelReady(true);
        return;
      }
      setItems(page.items.slice(0, 5));
      setPanelReady(true);
      setError(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, guest]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="relative inline-flex size-11 items-center justify-center rounded-control border border-border bg-surface text-foreground"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon />
        {unread > 0 ? (
          <span className="absolute top-1 right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary-solid px-1 text-[0.7rem] font-semibold text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div id={panelId} role="region" aria-label="Notifications" className="absolute right-0 z-40 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-3 rounded-panel border border-border bg-surface p-3 shadow-card">
          {guest ? (
            <div className="grid gap-3">
              <p className="text-sm leading-6 text-muted">Sign in to see in-app notifications for saved IPOs. Email and SMS are not sent.</p>
              <Link href="/login" className="text-sm font-medium text-link underline">
                Sign in
              </Link>
            </div>
          ) : error ? (
            <p role="alert" className="text-sm text-negative-text">
              Notifications could not be loaded.
            </p>
          ) : !panelReady ? (
            <p className="text-sm leading-6 text-muted">Loading notifications.</p>
          ) : items.length === 0 ? (
            <p className="text-sm leading-6 text-muted">No notifications yet. Turn on an alert category after you save an IPO.</p>
          ) : (
            <ul className="grid gap-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="grid w-full gap-1 rounded-control px-2 py-2 text-left hover:bg-background"
                    onClick={() => {
                      void markNotificationRead(item.id).then(() => {
                        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, readAt: entry.readAt ?? new Date().toISOString() } : entry)));
                        setUnread((count) => (item.readAt ? count : Math.max(0, count - 1)));
                        setOpen(false);
                        if (item.ipoId) router.push(`/ipos/${item.ipoId}`);
                      });
                    }}
                  >
                    <span className={item.readAt ? "text-sm text-foreground" : "text-sm font-semibold text-foreground"}>{item.title}</span>
                    <span className="text-sm leading-5 text-muted">{item.body}</span>
                    <IstDateTime value={new Date(item.createdAt)} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link href="/notifications" className="text-sm font-medium text-link underline" onClick={() => setOpen(false)}>
            Open notification center
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current" strokeWidth="1.8">
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </svg>
  );
}
