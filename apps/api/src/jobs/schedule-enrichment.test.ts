import assert from "node:assert/strict";
import test from "node:test";
import { defaultSyncPolicy } from "../config/sync-policy.ts";
import { syncPolicyForCronPass, defaultCronPolicy } from "../config/cron-policy.ts";
import {
  emptySubscriptionHistoryConfirmed,
  hasUsableSubscriptionHistory,
  isRecentlyListed,
  planIpoDetail,
  planSubscriptionSync,
} from "./schedule.ts";
import type { SyncRunRecord } from "../db/records.ts";

const now = new Date("2026-11-04T06:00:00.000Z"); // 11:30 IST on 4 Nov 2026

function run(partial: Partial<SyncRunRecord> & Pick<SyncRunRecord, "status" | "fetchedCount">): SyncRunRecord {
  return {
    providerKey: "ipo-guru",
    resource: "history-sub-listed-recent",
    startedAt: now,
    finishedAt: now,
    errorName: null,
    expiresAt: new Date(now.getTime() + 86_400_000),
    ...partial,
  };
}

test("recently listed detection uses IST calendar dates within 14 days", () => {
  assert.equal(
    isRecentlyListed({ status: "listed", listingDate: "2026-11-01", today: "2026-11-04" }),
    true,
  );
  assert.equal(
    isRecentlyListed({ status: "listed", listingDate: "2026-10-01", today: "2026-11-04" }),
    false,
  );
  assert.equal(
    isRecentlyListed({ status: "allotment", listingDate: "2026-11-01", today: "2026-11-04" }),
    false,
  );
});

test("planIpoDetail prefers allotment issues missing a company narrative", () => {
  const policy = syncPolicyForCronPass(defaultSyncPolicy(), defaultCronPolicy());
  const plan = planIpoDetail({
    now,
    policy,
    lastRun: () => null,
    ipos: [
      {
        id: "listed-old",
        status: "listed",
        listingDate: "2025-01-01",
        listingPriceRupees: 100,
        hasCompanyNarrative: true,
      },
      {
        id: "allotment-missing",
        status: "allotment",
        listingDate: "2026-11-05",
        hasCompanyNarrative: false,
      },
      {
        id: "open-ok",
        status: "open",
        hasCompanyNarrative: true,
      },
    ],
  });
  assert.deepEqual(
    plan.map((row) => row.subject),
    ["open-ok", "allotment-missing"],
  );
});

test("planIpoDetail allows recently listed rows missing listing price", () => {
  const policy = syncPolicyForCronPass(defaultSyncPolicy(), defaultCronPolicy());
  const plan = planIpoDetail({
    now,
    policy,
    lastRun: () => null,
    ipos: [
      {
        id: "listed-gap",
        status: "listed",
        listingDate: "2026-11-03",
        listingPriceRupees: null,
        hasCompanyNarrative: true,
      },
    ],
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0]?.subject, "listed-gap");
});

test("recently listed IPO with no stored subscription observations is selected for catch-up", () => {
  const policy = syncPolicyForCronPass(defaultSyncPolicy(), defaultCronPolicy());
  const due = planSubscriptionSync({
    now,
    policy,
    kind: "history",
    lastRun: () => null,
    ipos: [
      {
        id: "listed-recent",
        status: "listed",
        listingDate: "2026-11-02",
        hasSubscriptionHistory: false,
      },
      {
        id: "listed-old",
        status: "listed",
        listingDate: "2025-06-01",
        hasSubscriptionHistory: false,
      },
    ],
  });
  assert.deepEqual(
    due.map((row) => row.subject),
    ["listed-recent"],
  );
});

test("recently listed IPO with complete final history is not repeatedly fetched", () => {
  const policy = syncPolicyForCronPass(defaultSyncPolicy(), defaultCronPolicy());
  const afterStored = planSubscriptionSync({
    now,
    policy,
    kind: "history",
    lastRun: () => null,
    ipos: [
      {
        id: "listed-recent",
        status: "listed",
        listingDate: "2026-11-02",
        hasSubscriptionHistory: true,
      },
    ],
  });
  assert.equal(afterStored.length, 0);
});

test("successful HTTP with zero usable observations does not establish completeness", () => {
  assert.equal(emptySubscriptionHistoryConfirmed(run({ status: "succeeded", fetchedCount: 0 })), true);
  assert.equal(emptySubscriptionHistoryConfirmed(run({ status: "succeeded", fetchedCount: 1 })), false);
  assert.equal(hasUsableSubscriptionHistory([]), false);
  assert.equal(
    hasUsableSubscriptionHistory([{ cadence: "daily", totalTimes: 0, qibTimes: null, niiTimes: null, retailTimes: null }]),
    true,
  );
  assert.equal(
    hasUsableSubscriptionHistory([{ cadence: "live", totalTimes: 12.5, qibTimes: null, niiTimes: null, retailTimes: null }]),
    false,
  );

  const policy = syncPolicyForCronPass(defaultSyncPolicy(), defaultCronPolicy());
  const emptySuccess = planSubscriptionSync({
    now,
    policy,
    kind: "history",
    lastRun: () => run({ status: "succeeded", fetchedCount: 0 }),
    ipos: [
      {
        id: "listed-recent",
        status: "listed",
        listingDate: "2026-11-02",
        hasSubscriptionHistory: false,
      },
    ],
  });
  assert.equal(emptySuccess.length, 0);

  const staleSuccess = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const successWithoutStored = planSubscriptionSync({
    now,
    policy,
    kind: "history",
    lastRun: () =>
      run({
        status: "succeeded",
        fetchedCount: 3,
        startedAt: staleSuccess,
        finishedAt: staleSuccess,
      }),
    ipos: [
      {
        id: "listed-recent",
        status: "listed",
        listingDate: "2026-11-02",
        hasSubscriptionHistory: false,
      },
    ],
  });
  assert.equal(successWithoutStored.length, 1);
});

test("open IPO subscription polling remains prioritized over listed catch-up", () => {
  const policy = syncPolicyForCronPass(defaultSyncPolicy(), defaultCronPolicy());
  const plan = planSubscriptionSync({
    now,
    policy,
    kind: "history",
    lastRun: () => null,
    ipos: [
      {
        id: "listed-recent",
        status: "listed",
        listingDate: "2026-11-02",
        hasSubscriptionHistory: false,
      },
      {
        id: "open-active",
        status: "open",
      },
      {
        id: "upcoming-soon",
        status: "upcoming",
      },
    ],
  });
  assert.deepEqual(
    plan.map((row) => row.subject),
    ["open-active", "listed-recent", "upcoming-soon"],
  );
});

test("IPO outside the recent-listing window is excluded from automatic historical backfill", () => {
  const policy = syncPolicyForCronPass(defaultSyncPolicy(), defaultCronPolicy());
  const plan = planSubscriptionSync({
    now,
    policy,
    kind: "history",
    lastRun: () => null,
    ipos: [
      {
        id: "listed-old",
        status: "listed",
        listingDate: "2026-09-01",
        hasSubscriptionHistory: false,
      },
    ],
  });
  assert.equal(plan.length, 0);
});
