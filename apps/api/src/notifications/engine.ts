import type { Board } from "@ipo-singh/contracts";
import type { DirectoryRow } from "../modules/catalog/present.ts";
import { normalizeAccountPreferences } from "../accounts/session-service.ts";
import { createAccountId } from "../accounts/tokens.ts";
import type { CacheHandle } from "../cache/connection.ts";
import type { CacheStore } from "../cache/store.ts";
import type { AlertPolicy } from "../config/alert-policy.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import type { GmpObservationRecord, SubscriptionObservationRecord } from "../db/records.ts";
import type { GmpRepository, PersistenceStore, SubscriptionRepository } from "../db/repositories.ts";
import type { SyncLock } from "../jobs/lock.ts";
import type { Logger } from "../shared/logger.ts";
import { publicPlainText } from "../shared/public-text.ts";
import { loadCatalogueRows } from "../watchlist/catalogue.ts";
import type { WatchlistRecord } from "../watchlist/records.ts";
import { accountAllowsBoardAlerts, anonymousAllowsBoardAlerts, notificationScopeForBoard } from "./eligibility.ts";
import { evaluateAlerts, notificationRetentionMs, type AlertIssue, type GmpReading, type ScheduleSnapshot } from "./evaluate.ts";
import { countNonCriticalMainboardToday, mainboardDigestCandidate, planMainboardDeliveries, type QueuedCandidate } from "./frequency.ts";
import { recordAlertMetrics } from "./metrics.ts";
import type { NotificationRecord } from "./records.ts";
import { isAnonymousPushOwner } from "./push-tokens.ts";

export type AlertCursor = {
  read(): Promise<string | null>;
  write(value: string | null): Promise<void>;
};

export type AlertEngineStatus = "ran" | "locked" | "unavailable" | "failed";

export type AlertEngineResult = {
  status: AlertEngineStatus;
  created: number;
  duplicates: number;
  skipped: number;
  users: number;
  observationQueries: number;
  attempts: number;
  orderedIpoIds: string[];
  startedAt: string;
  finishedAt: string;
};

const cursorKey = "ipo-singh:alert-cursor";
const mainboardCursorKey = "ipo-singh:alert-mainboard-cursor";
const cursorTtlMs = 7 * 24 * 60 * 60 * 1000;

export function createMemoryAlertCursor(): AlertCursor {
  let value: string | null = null;
  return {
    async read() {
      return value;
    },
    async write(next) {
      value = next;
    },
  };
}

export function createAlertCursor(store: Pick<CacheStore, "get" | "set"> | null, key = cursorKey): AlertCursor {
  if (!store) return createMemoryAlertCursor();
  return {
    async read() {
      try {
        const raw = await store.get(key);
        return raw && raw.length > 0 ? raw : null;
      } catch {
        return null;
      }
    },
    async write(next) {
      await store.set(key, next ?? "", cursorTtlMs);
    },
  };
}

type ObservationBatch<T> = {
  findByIpos?: (ipoIds: readonly string[], now?: Date) => Promise<T[]>;
};

function byNewest<T extends { observedAt: Date | null }>(rows: readonly T[]): T[] {
  return rows.slice().sort((left, right) => (right.observedAt?.getTime() ?? 0) - (left.observedAt?.getTime() ?? 0));
}

function finiteAmount(value: number | null): number | null {
  if (value === null) return null;
  return Number.isFinite(value) ? value : null;
}

function gmpReadings(rows: readonly GmpObservationRecord[]): GmpReading[] {
  return byNewest(rows).flatMap((row) => {
    if (row.amountRupees !== null && !Number.isFinite(row.amountRupees)) return [];
    return [{ amountRupees: row.amountRupees, observedAt: row.observedAt.toISOString(), freshness: row.source.freshness }];
  });
}

function subscriptionFact(row: SubscriptionObservationRecord | null): Pick<AlertIssue, "subscriptionTotalTimes" | "subscriptionFreshness"> {
  if (!row || (row.totalTimes !== null && (!Number.isFinite(row.totalTimes) || row.totalTimes < 0))) {
    return { subscriptionTotalTimes: null, subscriptionFreshness: null };
  }
  return { subscriptionTotalTimes: finiteAmount(row.totalTimes), subscriptionFreshness: row.source.freshness };
}

function issueFromRow(
  row: DirectoryRow,
  gmpByIpo: Map<string, GmpObservationRecord[]>,
  subscriptionByIpo: Map<string, SubscriptionObservationRecord[]>,
): AlertIssue {
  const subscription = byNewest(subscriptionByIpo.get(row.summary.id) ?? [])[0] ?? null;
  return {
    ipoId: row.summary.id,
    companyName: row.summary.companyName,
    status: row.summary.status,
    freshness: row.summary.provenance.freshness,
    openDate: row.summary.openDate,
    closeDate: row.summary.closeDate,
    allotmentDate: row.allotmentDate,
    listingDate: row.listingDate,
    gmp: gmpReadings(gmpByIpo.get(row.summary.id) ?? []),
    ...subscriptionFact(subscription),
  };
}

function observedAt(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function loadGrouped<T extends { ipoId: string }>(
  ids: readonly string[],
  repository: ObservationBatch<T> & { findByIpo(ipoId: string, now?: Date): Promise<T[]> },
  now: Date,
  counter: { n: number },
): Promise<Map<string, T[]>> {
  const grouped = new Map<string, T[]>();
  if (ids.length === 0) return grouped;
  if (typeof repository.findByIpos === "function") {
    counter.n += 1;
    for (const row of await repository.findByIpos(ids, now)) {
      const list = grouped.get(row.ipoId) ?? [];
      list.push(row);
      grouped.set(row.ipoId, list);
    }
    return grouped;
  }
  for (const id of ids) {
    counter.n += 1;
    grouped.set(id, await repository.findByIpo(id, now));
  }
  return grouped;
}

/**
 * Creates in-app notices from IPO data already stored by IPO Singh.
 * Mainboard: opted-in push owners (global, no watchlist).
 * SME: watchlist owners only.
 * Does not call IPO Guru.
 */
export async function runAlertEvaluation(input: {
  database: DatabaseHandle;
  cache: CacheHandle;
  locks: SyncLock;
  cursor: AlertCursor;
  policy: AlertPolicy;
  logger: Logger;
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
  loadRows?: (database: DatabaseHandle, cache: CacheHandle, logger: Logger) => Promise<DirectoryRow[]>;
  mainboardCursor?: AlertCursor;
}): Promise<AlertEngineResult> {
  const started = input.now ?? new Date();
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const loadRows = input.loadRows ?? loadCatalogueRows;
  const base = {
    created: 0,
    duplicates: 0,
    skipped: 0,
    users: 0,
    observationQueries: 0,
    attempts: 0,
    orderedIpoIds: [] as string[],
    startedAt: started.toISOString(),
  };

  const finish = (status: AlertEngineStatus, extra?: Partial<AlertEngineResult>): AlertEngineResult => {
    const result: AlertEngineResult = {
      ...base,
      ...extra,
      status,
      finishedAt: new Date().toISOString(),
    };
    recordAlertMetrics({
      created: result.created,
      duplicates: result.duplicates,
      skipped: result.skipped + (status === "locked" || status === "unavailable" ? 1 : 0),
      failed: status === "failed",
      finishedAt: result.finishedAt,
    });
    input.logger.info("alert_evaluation", {
      status: result.status,
      created: result.created,
      duplicates: result.duplicates,
      skipped: result.skipped,
      users: result.users,
      observationQueries: result.observationQueries,
      attempts: result.attempts,
    });
    return result;
  };

  const notifications = input.database.notifications;
  const watchlist = input.database.watchlist;
  const accounts = input.database.accounts;
  const store = input.database.store;
  const pushTokens = input.database.pushTokens;
  if (!notifications || !watchlist || !accounts || !store) return finish("unavailable");

  const release = await input.locks.acquire("alerts", input.policy.lockMs);
  if (!release) return finish("locked");

  try {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= input.policy.maxAttempts; attempt += 1) {
      try {
        const evaluated = await evaluatePage({
          database: input.database,
          cache: input.cache,
          cursor: input.cursor,
          mainboardCursor: input.mainboardCursor ?? createAlertCursor(input.cache.store, mainboardCursorKey),
          policy: input.policy,
          logger: input.logger,
          now: input.now ?? new Date(),
          loadRows,
          notifications,
          watchlist,
          accounts,
          store,
          pushTokens,
        });
        return finish("ran", { ...evaluated, attempts: attempt });
      } catch (error: unknown) {
        lastError = error;
        input.logger.warn("Alert evaluation attempt failed", { attempt, name: error instanceof Error ? error.name : "Error" });
        if (attempt < input.policy.maxAttempts) await sleep(25 * attempt);
      }
    }
    input.logger.error("Alert evaluation failed", { name: lastError instanceof Error ? lastError.name : "Error" });
    return finish("failed", { attempts: input.policy.maxAttempts });
  } finally {
    await release();
  }
}

async function evaluatePage(input: {
  database: DatabaseHandle;
  cache: CacheHandle;
  cursor: AlertCursor;
  mainboardCursor: AlertCursor;
  policy: AlertPolicy;
  logger: Logger;
  now: Date;
  loadRows: (database: DatabaseHandle, cache: CacheHandle, logger: Logger) => Promise<DirectoryRow[]>;
  notifications: NonNullable<DatabaseHandle["notifications"]>;
  watchlist: NonNullable<DatabaseHandle["watchlist"]>;
  accounts: NonNullable<DatabaseHandle["accounts"]>;
  store: PersistenceStore;
  pushTokens: DatabaseHandle["pushTokens"];
}): Promise<Omit<AlertEngineResult, "status" | "startedAt" | "finishedAt" | "attempts">> {
  const catalogue = await input.loadRows(input.database, input.cache, input.logger);
  const directory = new Map(catalogue.map((row) => [row.summary.id, row]));
  const counter = { n: 0 };

  let created = 0;
  let duplicates = 0;
  let skipped = 0;
  let users = 0;
  const orderedIpoIds: string[] = [];

  // --- SME: watchlist-only ---
  const afterWatch = await input.cursor.read();
  const watchPage = await input.watchlist.listBatch(afterWatch, input.policy.batchSize);
  if (watchPage.length === 0) {
    if (afterWatch) await input.cursor.write(null);
  } else {
    const smeRows = watchPage.filter((row) => {
      const issue = directory.get(row.ipoId);
      return issue && notificationScopeForBoard(issue.summary.board) === "watchlist";
    });
    const smeIds = [...new Set(smeRows.map((row) => row.ipoId))];
    orderedIpoIds.push(...smeIds);
    const userIds = [...new Set(smeRows.map((row) => row.userId))];
    const [usersFound, baselines, gmpByIpo, subscriptionByIpo] = await Promise.all([
      input.accounts.findUsers(userIds.filter((id) => !isAnonymousPushOwner(id))),
      input.notifications.listBaselines(userIds),
      loadGrouped(smeIds, input.store.gmp as GmpRepository & ObservationBatch<GmpObservationRecord>, input.now, counter),
      loadGrouped(smeIds, input.store.subscriptions as SubscriptionRepository & ObservationBatch<SubscriptionObservationRecord>, input.now, counter),
    ]);
    const usersById = new Map(usersFound.map((user) => [user.id, user]));
    const baselinesByUser = groupBaselines(baselines);
    const savedByUser = groupWatchlist(smeRows);

    for (const userId of savedByUser.keys()) {
      users += 1;
      const issues: AlertIssue[] = [];
      const sources = new Map<string, NotificationRecord["source"]>();
      for (const saved of savedByUser.get(userId) ?? []) {
        const row = directory.get(saved.ipoId);
        if (!row || notificationScopeForBoard(row.summary.board) !== "watchlist") {
          skipped += 1;
          continue;
        }
        issues.push(issueFromRow(row, gmpByIpo, subscriptionByIpo));
        sources.set(saved.ipoId, { name: row.summary.provenance.sourceName, observedAt: observedAt(row.summary.provenance.retrievedAt) });
      }

      const gate = await recipientGate({
        ownerId: userId,
        accounts: input.accounts,
        pushTokens: input.pushTokens,
        usersById,
      });
      if (!gate) {
        skipped += 1;
        continue;
      }

      const preferences =
        gate.kind === "user"
          ? gate.preferences
          : syntheticAnonymousPreferences(gate.anonymous);

      // Always advance schedule baselines for watchlisted SME issues, even when the owner is opted out,
      // so re-enabling alerts does not replay every historical schedule change.
      const evaluated = evaluateAlerts({
        now: input.now,
        preferences,
        issues,
        baselines: baselinesByUser.get(userId) ?? new Map(),
        gmpChangeRupees: input.policy.gmpChangeRupees,
        closeHourIst: input.policy.closeHourIst,
      });
      for (const baseline of evaluated.baselines) {
        await input.notifications.saveBaseline({ ...baseline, userId, seenAt: input.now });
      }

      const smeAlertsOn =
        preferences.alertsEnabled &&
        (gate.kind === "anonymous" ? gate.anonymous.smeWatchlistAlerts : preferences.smeWatchlistAlerts);
      if (!smeAlertsOn) {
        skipped += 1;
        await input.notifications.purge(userId, input.now);
        continue;
      }

      for (const candidate of evaluated.candidates) {
        const row = candidate.ipoId ? directory.get(candidate.ipoId) : null;
        const board = row?.summary.board;
        if (!board || notificationScopeForBoard(board) !== "watchlist") {
          skipped += 1;
          continue;
        }
        if (gate.kind === "user" && !accountAllowsBoardAlerts(preferences, board, candidate.type)) continue;
        if (gate.kind === "anonymous" && !anonymousAllowsBoardAlerts(gate.anonymous, board, candidate.type)) continue;

        const outcome = await insertCandidate({
          notifications: input.notifications,
          userId,
          candidate,
          board,
          now: input.now,
          sources,
          directory,
        });
        if (outcome === "created") created += 1;
        else duplicates += 1;
      }
      await input.notifications.purge(userId, input.now);
    }

    const nextWatch = watchPage.length < input.policy.batchSize ? null : watchPage[watchPage.length - 1]?.id ?? null;
    await input.cursor.write(nextWatch);
  }

  // --- Mainboard: global opted-in push owners ---
  if (input.pushTokens) {
    const afterOwner = await input.mainboardCursor.read();
    const ownerIds = await input.pushTokens.listActiveOwnerIds(afterOwner, input.policy.batchSize);
    const mainboardRows = catalogue.filter((row) => notificationScopeForBoard(row.summary.board) === "global");
    const mainboardIds = mainboardRows.map((row) => row.summary.id);
    orderedIpoIds.push(...mainboardIds);
    const [gmpByIpo, subscriptionByIpo] = await Promise.all([
      loadGrouped(mainboardIds, input.store.gmp as GmpRepository & ObservationBatch<GmpObservationRecord>, input.now, counter),
      loadGrouped(mainboardIds, input.store.subscriptions as SubscriptionRepository & ObservationBatch<SubscriptionObservationRecord>, input.now, counter),
    ]);
    const mainboardIssues = mainboardRows.map((row) => issueFromRow(row, gmpByIpo, subscriptionByIpo));
    const usersFound = await input.accounts.findUsers(ownerIds.filter((id) => !isAnonymousPushOwner(id)));
    const usersById = new Map(usersFound.map((user) => [user.id, user]));
    const baselines = await input.notifications.listBaselines(ownerIds);
    const baselinesByUser = groupBaselines(baselines);

    for (const ownerId of ownerIds) {
      users += 1;
      const gate = await recipientGate({
        ownerId,
        accounts: input.accounts,
        pushTokens: input.pushTokens,
        usersById,
      });
      if (!gate) {
        skipped += 1;
        continue;
      }
      const preferences =
        gate.kind === "user" ? gate.preferences : syntheticAnonymousPreferences(gate.anonymous);
      if (gate.kind === "user" && !preferences.mainboardGlobalAlerts) {
        skipped += 1;
        continue;
      }
      if (gate.kind === "anonymous" && !gate.anonymous.mainboardGlobalAlerts) {
        skipped += 1;
        continue;
      }
      if (!preferences.alertsEnabled) {
        skipped += 1;
        continue;
      }

      const evaluated = evaluateAlerts({
        now: input.now,
        preferences,
        issues: mainboardIssues,
        baselines: baselinesByUser.get(ownerId) ?? new Map(),
        gmpChangeRupees: input.policy.gmpChangeRupees,
        closeHourIst: input.policy.closeHourIst,
      });

      const queued: QueuedCandidate[] = [];
      const sources = new Map<string, NotificationRecord["source"]>();
      for (const row of mainboardRows) {
        sources.set(row.summary.id, {
          name: row.summary.provenance.sourceName,
          observedAt: observedAt(row.summary.provenance.retrievedAt),
        });
      }
      for (const candidate of evaluated.candidates) {
        const row = candidate.ipoId ? directory.get(candidate.ipoId) : null;
        const board = row?.summary.board;
        if (board !== "mainboard") {
          if (!board) input.logger.warn("alert_skip_unknown_board", { ipoId: candidate.ipoId });
          skipped += 1;
          continue;
        }
        if (gate.kind === "user" && !accountAllowsBoardAlerts(preferences, board, candidate.type)) continue;
        if (gate.kind === "anonymous" && !anonymousAllowsBoardAlerts(gate.anonymous, board, candidate.type)) continue;
        queued.push({ ...candidate, board });
      }

      const recent = await input.notifications.listForUser(ownerId, input.now);
      const already = countNonCriticalMainboardToday(recent, input.now);
      const decisions = planMainboardDeliveries({
        now: input.now,
        alreadySentNonCriticalToday: already,
        candidates: queued,
        policy: { maxNonCriticalPerDay: input.policy.mainboardMaxNonCriticalPerDay },
      });

      for (const decision of decisions) {
        if (decision.action === "drop") {
          skipped += 1;
          continue;
        }
        if (decision.action === "digest") {
          const digest = mainboardDigestCandidate({ now: input.now, candidates: decision.candidates });
          if (!digest) continue;
          const outcome = await insertCandidate({
            notifications: input.notifications,
            userId: ownerId,
            candidate: digest,
            board: "mainboard",
            now: input.now,
            sources,
            directory,
          });
          if (outcome === "created") created += 1;
          else duplicates += 1;
          continue;
        }
        const outcome = await insertCandidate({
          notifications: input.notifications,
          userId: ownerId,
          candidate: decision.candidate,
          board: "mainboard",
          now: input.now,
          sources,
          directory,
        });
        if (outcome === "created") created += 1;
        else duplicates += 1;
      }

      for (const baseline of evaluated.baselines) {
        await input.notifications.saveBaseline({ ...baseline, userId: ownerId, seenAt: input.now });
      }
      await input.notifications.purge(ownerId, input.now);
    }

    const nextOwner = ownerIds.length < input.policy.batchSize ? null : ownerIds[ownerIds.length - 1] ?? null;
    await input.mainboardCursor.write(nextOwner);
  }

  return { created, duplicates, skipped, users, observationQueries: counter.n, orderedIpoIds };
}

function groupBaselines(baselines: readonly (ScheduleSnapshot & { userId: string })[]) {
  const baselinesByUser = new Map<string, Map<string, ScheduleSnapshot>>();
  for (const baseline of baselines) {
    const current = baselinesByUser.get(baseline.userId) ?? new Map<string, ScheduleSnapshot>();
    current.set(baseline.ipoId, baseline);
    baselinesByUser.set(baseline.userId, current);
  }
  return baselinesByUser;
}

function groupWatchlist(rows: readonly WatchlistRecord[]) {
  const savedByUser = new Map<string, WatchlistRecord[]>();
  for (const row of rows) {
    const list = savedByUser.get(row.userId) ?? [];
    list.push(row);
    savedByUser.set(row.userId, list);
  }
  return savedByUser;
}

function syntheticAnonymousPreferences(gate: {
  mainboardGlobalAlerts: boolean;
  smeWatchlistAlerts: boolean;
  allotmentAlertsEnabled: boolean;
}) {
  return normalizeAccountPreferences({
    ...normalizeAccountPreferences(undefined),
    alertsEnabled: gate.mainboardGlobalAlerts || gate.smeWatchlistAlerts,
    mainboardGlobalAlerts: gate.mainboardGlobalAlerts,
    smeWatchlistAlerts: gate.smeWatchlistAlerts,
    mobilePush: "when-available",
    notificationCategories: {
      open: gate.mainboardGlobalAlerts || gate.smeWatchlistAlerts,
      closing: gate.mainboardGlobalAlerts || gate.smeWatchlistAlerts,
      listing: gate.mainboardGlobalAlerts || gate.smeWatchlistAlerts,
      allotment: gate.allotmentAlertsEnabled,
      gmp: gate.mainboardGlobalAlerts || gate.smeWatchlistAlerts,
      subscription: gate.mainboardGlobalAlerts || gate.smeWatchlistAlerts,
      schedule: gate.mainboardGlobalAlerts || gate.smeWatchlistAlerts,
      announcement: false,
    },
  });
}

async function recipientGate(input: {
  ownerId: string;
  accounts: NonNullable<DatabaseHandle["accounts"]>;
  pushTokens: DatabaseHandle["pushTokens"];
  usersById: Map<string, { status: string; preferences: Parameters<typeof normalizeAccountPreferences>[0] }>;
}): Promise<
  | { kind: "user"; preferences: ReturnType<typeof normalizeAccountPreferences> }
  | { kind: "anonymous"; anonymous: { mainboardGlobalAlerts: boolean; smeWatchlistAlerts: boolean; allotmentAlertsEnabled: boolean } }
  | null
> {
  if (isAnonymousPushOwner(input.ownerId)) {
    const tokens = input.pushTokens ? await input.pushTokens.listActive(input.ownerId) : [];
    const token = tokens.find((item) => item.ownerKind === "anonymous");
    if (!token) return null;
    return {
      kind: "anonymous",
      anonymous: {
        mainboardGlobalAlerts: token.mainboardGlobalAlerts,
        smeWatchlistAlerts: token.smeWatchlistAlerts,
        allotmentAlertsEnabled: token.allotmentAlertsEnabled,
      },
    };
  }
  const user = input.usersById.get(input.ownerId) ?? (await input.accounts.findUser(input.ownerId));
  if (!user || user.status !== "active") return null;
  return { kind: "user", preferences: normalizeAccountPreferences(user.preferences) };
}

async function insertCandidate(input: {
  notifications: NonNullable<DatabaseHandle["notifications"]>;
  userId: string;
  candidate: QueuedCandidate | { type: NotificationRecord["type"]; ipoId: string | null; title: string; body: string; dedupeKey: string };
  board: Board;
  now: Date;
  sources: Map<string, NotificationRecord["source"]>;
  directory: Map<string, DirectoryRow>;
}): Promise<"created" | "duplicate"> {
  const title = publicPlainText(input.candidate.title).slice(0, 120);
  const body = publicPlainText(input.candidate.body).slice(0, 500);
  if (!title || !body) return "duplicate";
  const routeId =
    input.candidate.ipoId !== null
      ? input.directory.get(input.candidate.ipoId)?.summary.slug ?? input.candidate.ipoId
      : null;
  return input.notifications.insertIfNew({
    id: createAccountId(),
    userId: input.userId,
    type: input.candidate.type,
    ipoId: routeId,
    title,
    body,
    createdAt: input.now,
    readAt: null,
    expiresAt: new Date(input.now.getTime() + notificationRetentionMs),
    dedupeKey: input.candidate.dedupeKey,
    delivery: { inApp: "delivered", push: "not-sent" },
    source: input.candidate.ipoId ? input.sources.get(input.candidate.ipoId) ?? null : null,
  });
}
