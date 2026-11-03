import { useEffect, useRef, useState } from "react";
import type { AccountPreferences, NotificationItem } from "@ipo-singh/contracts";
import { formatIstDateTime } from "@ipo-singh/core";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { notificationCategoryOptions } from "../account/preferences";
import { useAuth } from "../auth/provider";
import { AppText } from "../components/app-text";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { LoadingSkeleton } from "../components/loading-skeleton";
import { PrimaryButton } from "../components/primary-button";
import { ScreenContainer } from "../components/screen-container";
import { SectionHeader } from "../components/section-header";
import { notificationIssueRoute, notificationTypeLabels } from "../notifications/inbox";
import { AnonymousAllotmentReminders, PushReminders } from "../notifications/push-reminders";
import { useNotifications } from "../notifications/provider";
import { useWatchlist } from "../watchlist/provider";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";

export function NotificationsScreen() {
  const notifications = useNotifications();
  const loaded = notifications.status === "ready" || notifications.status === "error" || notifications.status === "offline";
  const started = useRef(false);

  useEffect(() => {
    if (started.current || notifications.status === "loading" || notifications.status === "guest") return;
    started.current = true;
    void notifications.reload();
  }, [notifications]);

  return (
    <ScreenContainer safeBottom refreshing={notifications.refreshing} onRefresh={() => { void notifications.reload(); }}>
      <SectionHeader
        title="Notifications"
        description="In-app notices for this account. Email and SMS are not sent. Phone reminders need device registration and an explicit opt-in. Global allotment-out alerts do not require a watchlisted IPO."
      />
      {notifications.status === "loading" ? <LoadingSkeleton label="Loading notifications" /> : null}
      {notifications.status === "guest" ? <GuestNotice /> : null}
      {notifications.status === "guest" ? <AnonymousAllotmentReminders /> : null}
      {notifications.status === "offline" ? (
        <EmptyState title="Notifications could not be loaded." description={notifications.notice ?? "Notifications could not be loaded while offline."} />
      ) : null}
      {notifications.status === "error" && notifications.items.length === 0 ? (
        <ErrorState title="Notifications unavailable" message={notifications.notice ?? "Your in-app notifications could not be loaded."} action={<PrimaryButton label="Try again" onPress={() => { void notifications.reload(); }} />} />
      ) : null}
      {notifications.status === "ready" || (notifications.status === "error" && notifications.items.length > 0) ? (
        <InboxList />
      ) : null}
      {loaded && notifications.status !== "guest" ? <PushReminders /> : null}
      {loaded && notifications.status !== "guest" ? <AlertSettings /> : null}
    </ScreenContainer>
  );
}

function GuestNotice() {
  return (
    <View style={{ gap: mobileTheme.spacing[3] }}>
      <EmptyState title="Sign in to read notifications" description="Browsing stays open without an account. Email and SMS are not sent." />
      <PrimaryButton label="Go to Settings" onPress={() => router.push("/(tabs)/settings")} />
    </View>
  );
}

function InboxList() {
  const { palette } = useTheme();
  const notifications = useNotifications();
  return (
    <View style={{ gap: mobileTheme.spacing[4] }}>
      {notifications.notice ? <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">{notifications.notice}</AppText> : null}
      <PrimaryButton label="Mark all read" onPress={() => { void notifications.markAll(); }} disabled={notifications.unreadCount === 0 && notifications.items.every((item) => item.readAt !== null)} />
      {notifications.items.length === 0 ? (
        <EmptyState title="No notifications yet" description="A notice is added when a saved IPO has a stored change and that alert is turned on." />
      ) : notifications.items.map((item) => <NotificationRow key={item.id} item={item} />)}
      {notifications.nextCursor ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Load more notifications"
          accessibilityState={{ busy: notifications.loadingMore }}
          onPress={() => { void notifications.loadMore(); }}
          style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
        >
          <AppText weight="medium" style={{ color: palette.link }}>{notifications.loadingMore ? "Loading more" : "Load more"}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const { palette } = useTheme();
  const notifications = useNotifications();
  const watchlist = useWatchlist();
  const stored = item.ipoId ? watchlist.items.find((entry) => entry.ipoId === item.ipoId) : undefined;
  const route = notificationIssueRoute(stored?.ipo?.slug ?? item.ipoId);
  const unread = item.readAt === null;
  return (
    <View style={{ gap: mobileTheme.spacing[2], padding: mobileTheme.spacing[3], borderWidth: 1, borderColor: palette.border, borderRadius: mobileTheme.radius.md, backgroundColor: palette.surface }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: mobileTheme.spacing[3] }}>
        <AppText weight={unread ? "semibold" : "medium"} style={{ flex: 1 }}>{item.title}</AppText>
        <AppText size="sm" tone={unread ? "default" : "muted"}>{unread ? "Unread" : "Read"}</AppText>
      </View>
      <AppText size="sm" tone="muted">{notificationTypeLabels[item.type]}</AppText>
      <AppText>{item.body}</AppText>
      <AppText size="sm" tone="muted">{formatIstDateTime(new Date(item.createdAt))}</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing[4] }}>
        {route ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open IPO for ${item.title}`}
            onPress={() => {
              if (unread) void notifications.markRead(item.id);
              router.push(route);
            }}
            style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
          >
            <AppText weight="medium" style={{ color: palette.link }}>Open IPO</AppText>
          </Pressable>
        ) : null}
        {unread ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mark ${item.title} read`}
            onPress={() => { void notifications.markRead(item.id); }}
            style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
          >
            <AppText weight="medium" style={{ color: palette.link }}>Mark read</AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function AlertSettings() {
  const { state, saveAlertPreferences } = useAuth();
  const { palette } = useTheme();
  const [draft, setDraft] = useState<AccountPreferences | null>(null);
  const [pending, setPending] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  if (state.phase !== "ready") return null;
  const shown = draft ?? state.snapshot.account.preferences;

  async function commit(previous: AccountPreferences, next: AccountPreferences, patch: unknown) {
    if (pending) return;
    setDraft(next);
    setPending(true);
    const message = await saveAlertPreferences(patch);
    setPending(false);
    if (message) {
      setDraft(previous);
      setWarning(message);
      return;
    }
    setDraft(null);
    setWarning(null);
  }

  return (
    <View style={{ gap: mobileTheme.spacing[3] }}>
      <SectionHeader
        title="Notification preferences"
        description="Opening, closing, allotment results, and listing updates are the core set. Opt-outs are respected for in-app notices and account phone reminders. GMP text is unofficial and is not a recommendation. Email is not sent."
      />
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="In-app alerts"
        accessibilityState={{ checked: shown.alertsEnabled, disabled: pending }}
        disabled={pending}
        onPress={() => {
          const next = { ...shown, alertsEnabled: !shown.alertsEnabled };
          void commit(shown, next, { alertsEnabled: next.alertsEnabled });
        }}
        style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
      >
        <AppText weight="medium">{shown.alertsEnabled ? "In-app alerts on" : "In-app alerts off"}</AppText>
      </Pressable>
      <AppText size="sm" weight="medium">
        Core reminders
      </AppText>
      {notificationCategoryOptions.filter((option) => option.primary).map((option) => {
        const checked = shown.notificationCategories[option.key];
        return (
          <Pressable
            key={option.key}
            accessibilityRole="switch"
            accessibilityLabel={option.label}
            accessibilityState={{ checked, disabled: pending || !shown.alertsEnabled }}
            disabled={pending || !shown.alertsEnabled}
            onPress={() => {
              const next = {
                ...shown,
                notificationCategories: { ...shown.notificationCategories, [option.key]: !checked },
              };
              void commit(shown, next, { notificationCategories: { [option.key]: !checked } });
            }}
            style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: palette.border, opacity: shown.alertsEnabled ? 1 : 0.5 }}
          >
            <AppText>{checked ? `${option.label} on` : `${option.label} off`}</AppText>
          </Pressable>
        );
      })}
      <AppText size="sm" weight="medium">
        Additional categories
      </AppText>
      {notificationCategoryOptions.filter((option) => !option.primary).map((option) => {
        const checked = shown.notificationCategories[option.key];
        return (
          <Pressable
            key={option.key}
            accessibilityRole="switch"
            accessibilityLabel={option.label}
            accessibilityState={{ checked, disabled: pending || !shown.alertsEnabled }}
            disabled={pending || !shown.alertsEnabled}
            onPress={() => {
              const next = {
                ...shown,
                notificationCategories: { ...shown.notificationCategories, [option.key]: !checked },
              };
              void commit(shown, next, { notificationCategories: { [option.key]: !checked } });
            }}
            style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: palette.border, opacity: shown.alertsEnabled ? 1 : 0.5 }}
          >
            <AppText>{checked ? `${option.label} on` : `${option.label} off`}</AppText>
          </Pressable>
        );
      })}
      {warning ? <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">{warning}</AppText> : null}
    </View>
  );
}
