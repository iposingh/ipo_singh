import assert from "node:assert/strict";
import test from "node:test";
import { defaultSyncPolicy } from "../config/sync-policy.ts";
import { syncPolicyForCronPass, defaultCronPolicy } from "../config/cron-policy.ts";
import { isRecentlyListed, planIpoDetail, planSubscriptionSync } from "./schedule.ts";

const now = new Date("2026-11-04T06:00:00.000Z"); // 11:30 IST on 4 Nov 2026

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

test("planSubscriptionSync allows one history catch-up for recently listed issues", () => {
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
      },
      {
        id: "listed-old",
        status: "listed",
        listingDate: "2025-06-01",
      },
    ],
  });
  assert.deepEqual(
    due.map((row) => row.subject),
    ["listed-recent"],
  );

  const afterSuccess = planSubscriptionSync({
    now,
    policy,
    kind: "history",
    lastRun: (id) =>
      id === "listed-recent"
        ? {
            providerKey: "ipo-guru",
            resource: "history-sub-listed-recent",
            startedAt: now,
            finishedAt: now,
            status: "succeeded",
            fetchedCount: 1,
            errorName: null,
            expiresAt: new Date(now.getTime() + 86_400_000),
          }
        : null,
    ipos: [
      {
        id: "listed-recent",
        status: "listed",
        listingDate: "2026-11-02",
      },
    ],
  });
  assert.equal(afterSuccess.length, 0);
});
