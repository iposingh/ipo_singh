import { defaultAccountPreferences, type AccountPreferences } from "@ipo-singh/contracts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryAccountStore } from "../accounts/memory-store.ts";
import type { UserRecord } from "../accounts/records.ts";
import { createUnconfiguredCache } from "../cache/connection.ts";
import { readAlertPolicy } from "../config/alert-policy.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import type { GmpObservationRecord, SubscriptionObservationRecord } from "../db/records.ts";
import type { PersistenceStore } from "../db/repositories.ts";
import { runWorkerTick } from "../jobs/alert-pass.ts";
import { createSyncLock } from "../jobs/lock.ts";
import { directoryRowSchema, type DirectoryRow } from "../modules/catalog/present.ts";
import { createLogger } from "../shared/logger.ts";
import { ConfigError } from "../shared/errors.ts";
import type { AlertCursor } from "./engine.ts";
import { createMemoryAlertCursor, runAlertEvaluation } from "./engine.ts";
import { createMemoryNotificationStore } from "./memory-store.ts";
import { alertMetricsSnapshot, resetAlertMetrics } from "./metrics.ts";
import { significantGmpChangeRupees } from "./evaluate.ts";
import { createMemoryPushTokenStore } from "./push-memory-store.ts";
import { createMemoryWatchlistStore } from "../watchlist/memory-store.ts";

const now = new Date("2026-10-23T08:00:00.000Z");
const quiet = createLogger({ level: "error", service: "test", sink: () => undefined });
const expiresAt = new Date("2027-01-01T00:00:00.000Z");

function preferences(
  patch: {
    alertsEnabled?: boolean;
    mainboard?: boolean;
    sme?: boolean;
    categories?: Partial<AccountPreferences["notificationCategories"]>;
  } = {},
): AccountPreferences {
  return {
    ...defaultAccountPreferences,
    alertsEnabled: patch.alertsEnabled ?? true,
    mainboardGlobalAlerts: patch.mainboard ?? true,
    smeWatchlistAlerts: patch.sme ?? true,
    notificationCategories: { ...defaultAccountPreferences.notificationCategories, ...patch.categories },
  };
}

function user(id: string, prefs: AccountPreferences, status: UserRecord["status"] = "active"): UserRecord {
  return {
    id,
    email: `${id}@example.com`,
    displayName: null,
    status,
    role: "member",
    preferences: prefs,
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    lastAuthenticatedAt: now,
    suspendedAt: null,
    closedAt: null,
    passwordHash: "stored-hash",
  };
}

function row(
  id: string,
  freshness: "fresh" | "stale" = "fresh",
  closeDate: string | null = null,
  board: "mainboard" | "sme" = "sme",
): DirectoryRow {
  return directoryRowSchema.parse({
    summary: {
      id,
      slug: id,
      companyName: id === "fixture-mills" ? "Fixture Mills" : "Fixture Papers",
      board,
      status: "open",
      openDate: "2026-10-23",
      closeDate,
      gmpAmountRupees: null,
      subscriptionTotalTimes: null,
      provenance: { sourceName: "Fixture", retrievedAt: "2026-10-23T04:30:00.000Z", freshness },
    },
    allotmentDate: null,
    listingDate: null,
    symbol: "FX",
  });
}

function gmp(ipoId: string, amountRupees: number | null, observedAt: string, freshness: "fresh" | "stale" = "fresh"): GmpObservationRecord {
  return {
    ipoId,
    observedAt: new Date(observedAt),
    session: "daily",
    amountRupees,
    percent: null,
    indicativeImpliedPriceRupees: null,
    source: { source: "Fixture", fetchedAt: now, sourceUpdatedAt: null, freshness },
    expiresAt,
  };
}

function subscription(ipoId: string, totalTimes: number | null, freshness: "fresh" | "stale" = "fresh"): SubscriptionObservationRecord {
  return {
    ipoId,
    observedAt: now,
    observedOn: "2026-10-23",
    retailTimes: null,
    qibTimes: null,
    niiTimes: null,
    employeeTimes: null,
    totalTimes,
    source: { source: "Fixture", fetchedAt: now, sourceUpdatedAt: null, freshness },
    expiresAt,
  };
}

function harness(input: {
  rows: DirectoryRow[];
  gmp?: GmpObservationRecord[];
  subscriptions?: SubscriptionObservationRecord[];
  users: UserRecord[];
  saved: Array<{ id: string; userId: string; ipoId: string }>;
  policy?: Partial<ReturnType<typeof readAlertPolicy>>;
  cursor?: AlertCursor;
  locks?: ReturnType<typeof createSyncLock>;
  loadRows?: () => Promise<DirectoryRow[]>;
}) {
  const accounts = createMemoryAccountStore();
  const watchlist = createMemoryWatchlistStore();
  const notifications = createMemoryNotificationStore();
  const pushTokens = createMemoryPushTokenStore();
  const gmpCalls = { n: 0 };
  const subscriptionCalls = { n: 0 };
  const store = {
    gmp: {
      async findByIpos() {
        gmpCalls.n += 1;
        return input.gmp ?? [];
      },
      async findByIpo() {
        throw new Error("A per-IPO GMP query was used.");
      },
    },
    subscriptions: {
      async findByIpos() {
        subscriptionCalls.n += 1;
        return input.subscriptions ?? [];
      },
      async findByIpo() {
        throw new Error("A per-IPO subscription query was used.");
      },
    },
  } as unknown as PersistenceStore;
  const database: DatabaseHandle = {
    async check() {
      return "ok";
    },
    async close() {
      return undefined;
    },
    store,
    accounts,
    watchlist,
    notifications,
    pushTokens,
  };
  return {
    accounts,
    watchlist,
    notifications,
    pushTokens,
    gmpCalls,
    subscriptionCalls,
    database,
    async ready() {
      for (const account of input.users) await accounts.insertUser(account);
      for (const saved of input.saved) {
        await watchlist.save({ id: saved.id, userId: saved.userId, ipoId: saved.ipoId, addedAt: now, note: null }, false);
      }
    },
    run(loadRows = input.loadRows ?? (async () => input.rows)) {
      return runAlertEvaluation({
        database,
        cache: createUnconfiguredCache(defaultCachePolicy(), defaultQuotaPolicy(), quiet),
        locks: input.locks ?? createSyncLock(null, { allowProcessLocal: true }),
        cursor: input.cursor ?? createMemoryAlertCursor(),
        policy: { ...readAlertPolicy({}), batchSize: 40, ...input.policy },
        logger: quiet,
        now,
        sleep: async () => undefined,
        loadRows,
      });
    },
  };
}

describe("alert evaluation", () => {
  it("uses the configured GMP threshold and ignores an invalid reading", async () => {
    resetAlertMetrics();
    assert.equal(readAlertPolicy({}).gmpChangeRupees, significantGmpChangeRupees);
    assert.equal(readAlertPolicy({}).closeHourIst, null);
    assert.equal(readAlertPolicy({ ALERT_IPO_CLOSE_HOUR_IST: "17" }).closeHourIst, 17);
    assert.equal(readAlertPolicy({}).pushDeliveryEnabled, false);
    assert.equal(readAlertPolicy({ PUSH_DELIVERY_ENABLED: "true" }).pushDeliveryEnabled, true);
    assert.throws(() => readAlertPolicy({ ALERT_GMP_CHANGE_RUPEES: "0" }), ConfigError);
    assert.throws(() => readAlertPolicy({ ALERT_IPO_CLOSE_HOUR_IST: "0" }), ConfigError);
    const setup = harness({
      rows: [row("fixture-mills")],
      gmp: [gmp("fixture-mills", Number.NaN, "2026-10-23T09:00:00.000Z"), gmp("fixture-mills", 10, "2026-10-23T08:00:00.000Z"), gmp("fixture-mills", 24, "2026-10-22T08:00:00.000Z")],
      users: [user("user-gmp", preferences({ categories: { gmp: true } }))],
      saved: [{ id: "row-a", userId: "user-gmp", ipoId: "fixture-mills" }],
      policy: { gmpChangeRupees: 25 },
    });
    await setup.ready();
    const quietMove = await setup.run();
    assert.equal(quietMove.created, 0);
    assert.equal(setup.gmpCalls.n, 1);
    const moved = harness({
      rows: [row("fixture-mills")],
      gmp: [gmp("fixture-mills", 40, "2026-10-23T09:00:00.000Z"), gmp("fixture-mills", 15, "2026-10-22T08:00:00.000Z")],
      users: [user("user-gmp", preferences({ categories: { gmp: true } }))],
      saved: [{ id: "row-a", userId: "user-gmp", ipoId: "fixture-mills" }],
      policy: { gmpChangeRupees: 10 },
    });
    await moved.ready();
    const result = await moved.run();
    const stored = await moved.notifications.listForUser("user-gmp", now);
    assert.equal(result.created, 1);
    assert.equal(stored[0]?.type, "gmp");
    assert.equal(stored[0]?.delivery.push, "not-sent");
    assert.equal(stored[0]?.source?.name, "Fixture");
    assert.equal(stored[0]?.source?.observedAt?.toISOString(), "2026-10-23T04:30:00.000Z");
    assert.equal(stored[0]?.body.includes("recommendation"), true);
    assert.equal(stored[0]?.body.toLowerCase().includes("profit"), false);
    assert.equal(stored[0]?.body.toLowerCase().includes("buy"), false);
    assert.equal(JSON.stringify(stored[0]).includes("email"), false);
    assert.equal(moved.gmpCalls.n, 1);
    assert.equal(moved.subscriptionCalls.n, 1);
  });

  it("notifies only the users who opted in and shares one observation query", async () => {
    const setup = harness({
      rows: [row("fixture-mills"), row("fixture-papers")],
      subscriptions: [subscription("fixture-mills", 7)],
      users: [
        user("user-open", preferences({ categories: { open: true } })),
        user("user-off", preferences({ alertsEnabled: false, categories: { open: true } })),
        user("user-sub", preferences({ categories: { subscription: true } })),
      ],
      saved: [
        { id: "row-a", userId: "user-open", ipoId: "fixture-mills" },
        { id: "row-b", userId: "user-off", ipoId: "fixture-mills" },
        { id: "row-c", userId: "user-sub", ipoId: "fixture-mills" },
        { id: "row-d", userId: "user-open", ipoId: "fixture-papers" },
        { id: "row-e", userId: "user-sub", ipoId: "fixture-papers" },
      ],
    });
    await setup.ready();
    const result = await setup.run();
    const open = await setup.notifications.listForUser("user-open", now);
    const off = await setup.notifications.listForUser("user-off", now);
    const sub = await setup.notifications.listForUser("user-sub", now);
    assert.deepEqual(open.map((item) => item.type).sort(), ["open", "open"]);
    assert.equal(off.length, 0);
    assert.equal(sub[0]?.dedupeKey, "subscription:fixture-mills:5");
    assert.equal(result.observationQueries, 2);
    assert.equal(result.orderedIpoIds[0], "fixture-mills");
    assert.equal((await setup.notifications.findBaseline("user-off", "fixture-mills"))?.openDate, "2026-10-23");
  });

  it("skips stale and missing issues, then records a later schedule change once", async () => {
    const issues = [row("fixture-mills", "stale"), row("fixture-papers", "fresh", null)];
    const setup = harness({
      rows: issues,
      users: [user("user-dates", preferences({ categories: { open: true, schedule: true, closing: true } }))],
      saved: [
        { id: "row-a", userId: "user-dates", ipoId: "fixture-mills" },
        { id: "row-b", userId: "user-dates", ipoId: "missing-mills" },
        { id: "row-c", userId: "user-dates", ipoId: "fixture-papers" },
      ],
    });
    await setup.ready();
    const first = await setup.run();
    assert.equal(first.created, 1);
    assert.equal((await setup.notifications.listForUser("user-dates", now))[0]?.ipoId, "fixture-papers");
    assert.equal(await setup.notifications.findBaseline("user-dates", "fixture-mills"), null);
    issues[1] = row("fixture-papers", "fresh", "2026-11-02");
    const second = await setup.run();
    const stored = await setup.notifications.listForUser("user-dates", now);
    assert.equal(second.duplicates, 1);
    assert.equal(stored.filter((item) => item.type === "schedule").length, 1);
    assert.equal(stored.some((item) => item.body.includes("02 Nov 2026")), true);
    const third = await setup.run();
    assert.equal(third.created, 0);
    assert.ok(third.duplicates >= 1);
  });

  it("continues after a restart and retries a failed page without moving the cursor", async () => {
    const cursor = createMemoryAlertCursor();
    let seen: string | null = "start";
    const tracked: AlertCursor = {
      async read() {
        seen = await cursor.read();
        return seen;
      },
      async write(value) {
        seen = value;
        await cursor.write(value);
      },
    };
    const setup = harness({
      rows: [row("fixture-mills"), row("fixture-papers")],
      users: [
        user("user-a", preferences({ categories: { open: true } })),
        user("user-b", preferences({ categories: { open: true } })),
      ],
      saved: [
        { id: "row-a", userId: "user-a", ipoId: "fixture-mills" },
        { id: "row-b", userId: "user-b", ipoId: "fixture-papers" },
      ],
      policy: { batchSize: 1, maxAttempts: 2 },
      cursor: tracked,
    });
    await setup.ready();
    let catalogueCalls = 0;
    const flaky = async () => {
      catalogueCalls += 1;
      if (catalogueCalls === 1) throw new Error("temporary");
      return [row("fixture-mills"), row("fixture-papers")];
    };
    const recovered = await setup.run(flaky);
    assert.equal(recovered.attempts, 2);
    assert.equal(recovered.created, 1);
    assert.equal(seen, "row-a");
    const next = await setup.run();
    assert.equal(next.created, 1);
    assert.equal(seen, "row-b");
    const wrapped = await setup.run();
    assert.equal(wrapped.created, 0);
    assert.equal(seen, null);
  });

  it("lets one worker wait while another holds the alert lock", async () => {
    const locks = createSyncLock(null, { allowProcessLocal: true });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = 0;
    const setup = harness({
      rows: [row("fixture-mills")],
      users: [user("user-open", preferences({ categories: { open: true } }))],
      saved: [{ id: "row-a", userId: "user-open", ipoId: "fixture-mills" }],
      locks,
      loadRows: async () => {
        entered += 1;
        if (entered === 1) await gate;
        return [row("fixture-mills")];
      },
    });
    await setup.ready();
    const first = setup.run();
    while (entered === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await setup.run();
    assert.equal(second.status, "locked");
    release();
    const finished = await first;
    assert.equal(finished.status, "ran");
    assert.equal(finished.created, 1);
    const metrics = alertMetricsSnapshot();
    assert.ok(metrics.created >= 1);
    assert.ok(metrics.skipped >= 1);
  });

  it("still evaluates stored alerts when the sync pass fails", async () => {
    let alerts = 0;
    const events: string[] = [];
    const logger = createLogger({
      level: "error",
      service: "test",
      sink: (line) => {
        if (line.includes("Sync tick failed")) events.push("sync");
      },
    });
    await runWorkerTick({
      async sync() {
        throw new Error("provider down");
      },
      async alerts() {
        alerts += 1;
      },
      logger,
    });
    assert.equal(alerts, 1);
    assert.deepEqual(events, ["sync"]);
  });
});
