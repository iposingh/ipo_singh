import type { AccountPreferences } from "@ipo-singh/contracts";
import { createAccountId } from "../accounts/tokens.ts";
import type { CacheHandle } from "../cache/connection.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import type { GmpObservationRecord, SubscriptionObservationRecord } from "../db/records.ts";
import { HttpError } from "../shared/errors.ts";
import type { Logger } from "../shared/logger.ts";
import { publicPlainText } from "../shared/public-text.ts";
import { loadCatalogueRows } from "../watchlist/catalogue.ts";
import { readAlertPolicy } from "../config/alert-policy.ts";
import { announcementCandidate, evaluateAlerts, notificationRetentionMs, type AlertIssue, type GmpReading } from "./evaluate.ts";
import type { NotificationRecord, NotificationStore } from "./records.ts";

function byNewest<T extends { observedAt: Date | null }>(rows: readonly T[]): T[] {
  return rows.slice().sort((left, right) => (right.observedAt?.getTime() ?? 0) - (left.observedAt?.getTime() ?? 0));
}

function gmpReadings(rows: readonly GmpObservationRecord[]): GmpReading[] {
  return byNewest(rows).map((row) => ({
    amountRupees: row.amountRupees,
    observedAt: row.observedAt.toISOString(),
    freshness: row.source.freshness,
  }));
}

function latestSubscription(rows: readonly SubscriptionObservationRecord[]): SubscriptionObservationRecord | null {
  return byNewest(rows)[0] ?? null;
}

export async function syncUserNotifications(input: {
  database: DatabaseHandle;
  cache: CacheHandle;
  logger: Logger;
  userId: string;
  preferences: AccountPreferences;
  now?: Date;
  catalogueVisible?: boolean;
}): Promise<NotificationStore> {
  const notifications = input.database.notifications;
  const watchlist = input.database.watchlist;
  if (!notifications || !watchlist) throw new HttpError(503, "unavailable", "Notifications are temporarily unavailable.");
  const now = input.now ?? new Date();
  const saved = await watchlist.listForUser(input.userId);
  const rows = saved.length > 0 ? await loadCatalogueRows(input.database, input.cache, input.logger, input.catalogueVisible !== false) : [];
  const byId = new Map(rows.map((row) => [row.summary.id, row]));
  const store = input.database.store;
  const issues: AlertIssue[] = [];
  const sources = new Map<string, NotificationRecord["source"]>();
  for (const item of saved) {
    const row = byId.get(item.ipoId);
    if (!row || !store) continue;
    const retrievedAt = row.summary.provenance.retrievedAt ? new Date(row.summary.provenance.retrievedAt) : null;
    sources.set(item.ipoId, {
      name: row.summary.provenance.sourceName,
      observedAt: retrievedAt && !Number.isNaN(retrievedAt.getTime()) ? retrievedAt : null,
    });
    const [gmp, subscriptions] = await Promise.all([store.gmp.findByIpo(item.ipoId), store.subscriptions.findByIpo(item.ipoId)]);
    const subscription = latestSubscription(subscriptions);
    issues.push({
      ipoId: item.ipoId,
      companyName: row.summary.companyName,
      status: row.summary.status,
      freshness: row.summary.provenance.freshness,
      openDate: row.summary.openDate,
      closeDate: row.summary.closeDate,
      allotmentDate: row.allotmentDate,
      listingDate: row.listingDate,
      gmp: gmpReadings(gmp),
      subscriptionTotalTimes: subscription?.totalTimes ?? null,
      subscriptionFreshness: subscription?.source.freshness ?? null,
    });
  }
  const baselines = new Map();
  for (const issue of issues) {
    const baseline = await notifications.findBaseline(input.userId, issue.ipoId);
    if (baseline) baselines.set(issue.ipoId, baseline);
  }
  const alertPolicy = readAlertPolicy(process.env);
  const evaluated = evaluateAlerts({
    now,
    preferences: input.preferences,
    issues,
    baselines,
    gmpChangeRupees: alertPolicy.gmpChangeRupees,
    closeHourIst: alertPolicy.closeHourIst,
  });
  for (const candidate of evaluated.candidates) {
    const title = publicPlainText(candidate.title).slice(0, 120);
    const body = publicPlainText(candidate.body).slice(0, 500);
    if (!title || !body) continue;
    const record: NotificationRecord = {
      id: createAccountId(),
      userId: input.userId,
      type: candidate.type,
      ipoId: candidate.ipoId,
      title,
      body,
      createdAt: now,
      readAt: null,
      expiresAt: new Date(now.getTime() + notificationRetentionMs),
      dedupeKey: candidate.dedupeKey,
      delivery: { inApp: "delivered", push: "not-sent" },
      source: candidate.ipoId ? sources.get(candidate.ipoId) ?? null : null,
    };
    await notifications.insertIfNew(record);
  }
  for (const baseline of evaluated.baselines) {
    await notifications.saveBaseline({ ...baseline, userId: input.userId, seenAt: now });
  }
  await notifications.purge(input.userId, now);
  return notifications;
}

export async function deliverAnnouncement(input: {
  notifications: NotificationStore;
  userId: string;
  key: string;
  title: string;
  body: string;
  enabled: boolean;
  now?: Date;
}): Promise<"created" | "duplicate" | "skipped"> {
  if (!input.enabled) return "skipped";
  const candidate = announcementCandidate({ key: input.key, title: input.title, body: input.body });
  if (!candidate) return "skipped";
  const now = input.now ?? new Date();
  return input.notifications.insertIfNew({
    id: createAccountId(),
    userId: input.userId,
    type: candidate.type,
    ipoId: null,
    title: publicPlainText(candidate.title).slice(0, 120),
    body: publicPlainText(candidate.body).slice(0, 500),
    createdAt: now,
    readAt: null,
    expiresAt: new Date(now.getTime() + notificationRetentionMs),
    dedupeKey: candidate.dedupeKey,
    delivery: { inApp: "delivered", push: "not-sent" },
    source: { name: "IPO Singh", observedAt: now },
  });
}
