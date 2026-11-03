"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IstDateTime } from "@/components/financial/ist-date-time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  markAllNotificationsRead,
  markNotificationRead,
  readAlertPreferences,
  readNotificationPage,
  saveAlertPreferences,
} from "@/features/notifications/notification-client";
import { defaultAccountPreferences, type AccountPreferences, type NotificationItem } from "@ipo-singh/contracts";

const categories = [
  ["open", "Watchlisted IPO opening"],
  ["closing", "IPO closing soon"],
  ["allotment", "IPO allotment date"],
  ["listing", "IPO listing date"],
  ["gmp", "Significant GMP change"],
  ["subscription", "Subscription milestones"],
  ["schedule", "IPO schedule changes"],
  ["announcement", "IPO Singh announcements"],
] as const;

export function NotificationCenter() {
  const [status, setStatus] = useState<"loading" | "guest" | "ready" | "error">("loading");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<AccountPreferences>(defaultAccountPreferences);
  const [message, setMessage] = useState<string | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [page, prefs] = await Promise.all([readNotificationPage(), readAlertPreferences()]);
    if (page === "guest" || prefs === "guest") {
      setStatus("guest");
      return;
    }
    if (page === "error" || prefs === "error") {
      setStatus("error");
      return;
    }
    setItems(page.items);
    setCursor(page.nextCursor);
    setPreferences(prefs);
    setStatus("ready");
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([readNotificationPage(), readAlertPreferences()])
      .then(([page, prefs]) => {
        if (cancelled) return;
        if (page === "guest" || prefs === "guest") {
          setStatus("guest");
          return;
        }
        if (page === "error" || prefs === "error") {
          setStatus("error");
          return;
        }
        setItems(page.items);
        setCursor(page.nextCursor);
        setPreferences(prefs);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") return <LoadingState label="Loading notifications" />;
  if (status === "error") {
    return <ErrorState title="Notifications unavailable" message="Your in-app notifications could not be loaded." action={<Button type="button" onClick={() => void load()}>Try again</Button>} />;
  }
  if (status === "guest") {
    return (
      <Card className="grid gap-4">
        <p className="text-sm leading-6 text-muted">Sign in to read in-app notifications. Browsing IPO pages stays open without an account. Email and SMS are not sent.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login" className="inline-flex h-11 items-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground">
            Sign in
          </Link>
          <Link href="/register" className="inline-flex h-11 items-center rounded-control border border-border px-4 text-sm font-medium text-foreground">
            Create an account
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3" aria-labelledby="notification-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="notification-list-title" className="text-lg font-semibold">
            Inbox
          </h2>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void markAllNotificationsRead().then((ok) => {
                if (!ok) {
                  setAlertError("Notifications could not be marked read.");
                  return;
                }
                setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
                setMessage("All notifications are marked read.");
              });
            }}
          >
            Mark all read
          </Button>
        </div>
        {items.length === 0 ? (
          <EmptyState title="No notifications yet" description="A notice is added only when a saved IPO has a fresh stored date or reading and that alert is turned on." />
        ) : (
          <ul className="grid gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <Card className="grid gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className={item.readAt ? "text-base font-medium" : "text-base font-semibold"}>{item.title}</h3>
                    {item.readAt ? <span className="text-sm text-muted">Read</span> : <span className="text-sm font-medium text-foreground">Unread</span>}
                  </div>
                  <p className="text-sm leading-6 text-muted">{item.body}</p>
                  <IstDateTime value={new Date(item.createdAt)} />
                  <div className="flex flex-wrap gap-3">
                    {item.ipoId ? (
                      <Link href={`/ipos/${item.ipoId}`} className="text-sm font-medium text-link underline">
                        Open IPO
                      </Link>
                    ) : null}
                    {item.readAt ? null : (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          void markNotificationRead(item.id).then((saved) => {
                            if (!saved) {
                              setAlertError("That notification could not be marked read.");
                              return;
                            }
                            setItems((current) => current.map((entry) => (entry.id === item.id ? saved : entry)));
                          });
                        }}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {cursor ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void readNotificationPage(cursor).then((page) => {
                if (page === "guest" || page === "error") {
                  setStatus(page === "guest" ? "guest" : "error");
                  return;
                }
                setItems((current) => [...current, ...page.items]);
                setCursor(page.nextCursor);
              });
            }}
          >
            Load more
          </Button>
        ) : null}
      </section>
      <Card className="grid gap-3">
        <h2 className="text-lg font-semibold">Alert settings</h2>
        <p className="text-sm leading-6 text-muted">
          These choices apply to in-app notifications and phone reminders. Email and SMS are not sent. GMP text is unofficial and is not a recommendation.
        </p>
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setAlertError(null);
            setMessage(null);
            void saveAlertPreferences({
              alertsEnabled: preferences.alertsEnabled,
              notificationCategories: preferences.notificationCategories,
            }).then((saved) => {
              setBusy(false);
              if (!saved) {
                setAlertError("Those alert choices could not be saved.");
                return;
              }
              setPreferences(saved);
              setMessage("Alert settings saved.");
              void load();
            });
          }}
        >
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={preferences.alertsEnabled}
              onChange={(event) => setPreferences((current) => ({ ...current, alertsEnabled: event.target.checked }))}
            />
            Enable in-app alerts
          </label>
          <fieldset className="grid gap-2" disabled={!preferences.alertsEnabled}>
            <legend className="text-sm font-medium text-foreground">Categories</legend>
            {categories.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={preferences.notificationCategories[key]}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      notificationCategories: { ...current.notificationCategories, [key]: event.target.checked },
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          {alertError ? (
            <p role="alert" className="text-sm text-negative-text">
              {alertError}
            </p>
          ) : null}
          {message ? (
            <p role="status" className="text-sm text-foreground">
              {message}
            </p>
          ) : null}
          <Button type="submit" loading={busy}>
            {busy ? "Saving alerts" : "Save alerts"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
