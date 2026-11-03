import { defaultAccountPreferences, type AccountPreferences } from "@ipo-singh/contracts";
import { istCalendarDate } from "@ipo-singh/core";
import assert from "node:assert/strict";
import test from "node:test";
import { announcementCandidate, evaluateAlerts, significantGmpChangeRupees, type AlertIssue, type ScheduleSnapshot } from "./evaluate.ts";
import { deliverAnnouncement } from "./sync.ts";
import { createMemoryNotificationStore } from "./memory-store.ts";

const now = new Date("2026-10-23T08:00:00.000Z");
const today = istCalendarDate(now);
const tomorrow = "2026-10-24";

function preferences(patch: Partial<AccountPreferences["notificationCategories"]> = {}, alertsEnabled = true): AccountPreferences {
  return {
    ...defaultAccountPreferences,
    alertsEnabled,
    notificationCategories: { ...defaultAccountPreferences.notificationCategories, ...patch },
  };
}

function issue(patch: Partial<AlertIssue> = {}): AlertIssue {
  return {
    ipoId: "fixture-mills",
    companyName: "Fixture Mills",
    status: "open",
    freshness: "fresh",
    openDate: today,
    closeDate: null,
    allotmentDate: null,
    listingDate: null,
    gmp: [],
    subscriptionTotalTimes: null,
    subscriptionFreshness: null,
    ...patch,
  };
}

test("fresh stored dates can notify once and missing or stale dates cannot", () => {
  assert.ok(today);
  const opened = evaluateAlerts({ now, preferences: preferences({ open: true, closing: true, allotment: true, listing: true }), issues: [issue()], baselines: new Map() });
  assert.deepEqual(opened.candidates.map((item) => item.type), ["open"]);
  assert.equal(opened.candidates[0]?.dedupeKey, `open:fixture-mills:${today}`);

  const opensSoon = evaluateAlerts({
    now,
    preferences: preferences({ open: true }),
    issues: [issue({ openDate: tomorrow, status: "upcoming" })],
    baselines: new Map(),
  });
  assert.equal(opensSoon.candidates.length, 1);
  assert.equal(opensSoon.candidates[0]?.dedupeKey, `open:24h:fixture-mills:${tomorrow}`);

  const stale = evaluateAlerts({
    now,
    preferences: preferences({ open: true }),
    issues: [issue({ freshness: "stale" })],
    baselines: new Map(),
  });
  assert.equal(stale.candidates.length, 0);
  assert.equal(stale.baselines.length, 0);

  const undated = evaluateAlerts({
    now,
    preferences: preferences({ open: true, closing: true, allotment: true, listing: true }),
    issues: [issue({ openDate: null, closeDate: null, allotmentDate: null, listingDate: null })],
    baselines: new Map(),
  });
  assert.equal(undated.candidates.length, 0);

  const closing = evaluateAlerts({
    now,
    preferences: preferences({ closing: true }),
    issues: [issue({ openDate: null, closeDate: tomorrow, status: "open" })],
    baselines: new Map(),
  });
  assert.equal(closing.candidates.length, 1);
  assert.equal(closing.candidates[0]?.dedupeKey, `closing:24h:fixture-mills:${tomorrow}`);
  assert.equal(closing.candidates[0]?.body.includes(tomorrow) || closing.candidates[0]?.body.includes("24 Oct 2026"), true);

  const later = evaluateAlerts({
    now,
    preferences: preferences({ closing: true }),
    issues: [issue({ openDate: null, closeDate: "2026-11-01" })],
    baselines: new Map(),
  });
  assert.equal(later.candidates.length, 0);

  const listed = evaluateAlerts({
    now,
    preferences: preferences({ open: true, closing: true }),
    issues: [issue({ status: "listed", closeDate: today })],
    baselines: new Map(),
  });
  assert.equal(listed.candidates.length, 0);
});

test("GMP and subscription alerts use fresh numeric readings and do not recommend a trade", () => {
  const small = evaluateAlerts({
    now,
    preferences: preferences({ gmp: true, subscription: true }),
    issues: [issue({
      openDate: null,
      gmp: [
        { amountRupees: 24, observedAt: "2026-10-23T08:00:00.000Z", freshness: "fresh" },
        { amountRupees: 15, observedAt: "2026-10-22T08:00:00.000Z", freshness: "fresh" },
      ],
      subscriptionTotalTimes: 0,
      subscriptionFreshness: "fresh",
    })],
    baselines: new Map(),
  });
  assert.equal(small.candidates.length, 0);
  assert.equal(significantGmpChangeRupees, 10);

  const staleLatest = evaluateAlerts({
    now,
    preferences: preferences({ gmp: true }),
    issues: [issue({
      openDate: null,
      gmp: [
        { amountRupees: 40, observedAt: "2026-10-23T08:00:00.000Z", freshness: "stale" },
        { amountRupees: 15, observedAt: "2026-10-22T08:00:00.000Z", freshness: "fresh" },
        { amountRupees: 5, observedAt: "2026-10-21T08:00:00.000Z", freshness: "fresh" },
      ],
    })],
    baselines: new Map(),
  });
  assert.equal(staleLatest.candidates.length, 0);

  const moved = evaluateAlerts({
    now,
    preferences: preferences({ gmp: true }),
    issues: [issue({
      openDate: null,
      gmp: [
        { amountRupees: 0, observedAt: "2026-10-23T08:00:00.000Z", freshness: "fresh" },
        { amountRupees: 15, observedAt: "2026-10-22T08:00:00.000Z", freshness: "fresh" },
      ],
    })],
    baselines: new Map(),
  });
  assert.equal(moved.candidates.length, 1);
  assert.equal(moved.candidates[0]?.body.includes("recommendation"), true);
  assert.equal(moved.candidates[0]?.body.toLowerCase().includes("buy"), false);
  assert.equal(moved.candidates[0]?.body.includes("₹0") || moved.candidates[0]?.body.includes("₹0.00"), true);

  const missing = evaluateAlerts({
    now,
    preferences: preferences({ gmp: true, subscription: true }),
    issues: [issue({
      openDate: null,
      gmp: [{ amountRupees: null, observedAt: "2026-10-23T08:00:00.000Z", freshness: "fresh" }],
      subscriptionTotalTimes: null,
      subscriptionFreshness: "fresh",
    })],
    baselines: new Map(),
  });
  assert.equal(missing.candidates.length, 0);

  const milestone = evaluateAlerts({
    now,
    preferences: preferences({ subscription: true }),
    issues: [issue({ openDate: null, subscriptionTotalTimes: 7, subscriptionFreshness: "fresh" })],
    baselines: new Map(),
  });
  assert.equal(milestone.candidates.length, 1);
  assert.equal(milestone.candidates[0]?.dedupeKey, "subscription:fixture-mills:5");

  const staleMultiple = evaluateAlerts({
    now,
    preferences: preferences({ subscription: true }),
    issues: [issue({ openDate: null, subscriptionTotalTimes: 10, subscriptionFreshness: "stale" })],
    baselines: new Map(),
  });
  assert.equal(staleMultiple.candidates.length, 0);
});

test("a schedule change needs a stored previous schedule", () => {
  const first = evaluateAlerts({
    now,
    preferences: preferences({ schedule: true }),
    issues: [issue({ openDate: "2026-10-20", closeDate: "2026-10-22" })],
    baselines: new Map(),
  });
  assert.equal(first.candidates.length, 0);
  assert.equal(first.baselines[0]?.closeDate, "2026-10-22");

  const previous: ScheduleSnapshot = {
    ipoId: "fixture-mills",
    openDate: "2026-10-20",
    closeDate: "2026-10-22",
    allotmentDate: null,
    listingDate: null,
  };
  const changed = evaluateAlerts({
    now,
    preferences: preferences({ schedule: true }),
    issues: [issue({ openDate: "2026-10-20", closeDate: "2026-10-25" })],
    baselines: new Map([[previous.ipoId, previous]]),
  });
  assert.equal(changed.candidates.length, 1);
  assert.equal(changed.candidates[0]?.type, "schedule");
  assert.equal(changed.candidates[0]?.body.includes("22 Oct 2026"), true);
  assert.equal(changed.candidates[0]?.body.includes("25 Oct 2026"), true);

  const disabled = evaluateAlerts({
    now,
    preferences: preferences({ schedule: true }, false),
    issues: [issue({ openDate: "2026-10-20", closeDate: "2026-10-25" })],
    baselines: new Map([[previous.ipoId, previous]]),
  });
  assert.equal(disabled.candidates.length, 0);
  assert.equal(disabled.baselines.length, 1);
});

test("a close reminder uses the stored date, and a 1-hour reminder needs a configured hour", () => {
  assert.ok(today);
  const afternoon = new Date("2026-10-23T10:30:00.000Z");
  const soon = evaluateAlerts({
    now: afternoon,
    preferences: preferences({ closing: true }),
    issues: [issue({ openDate: null, closeDate: today, status: "open" })],
    baselines: new Map(),
    closeHourIst: 17,
  });
  assert.equal(soon.candidates.length, 1);
  assert.equal(soon.candidates[0]?.dedupeKey, `closing:1h:fixture-mills:${today}`);
  assert.equal(soon.candidates[0]?.title.includes("1 hour"), true);
  assert.equal(soon.candidates[0]?.body.includes("does not include a close time"), true);

  const morning = evaluateAlerts({
    now,
    preferences: preferences({ closing: true }),
    issues: [issue({ openDate: null, closeDate: today, status: "open" })],
    baselines: new Map(),
    closeHourIst: 17,
  });
  assert.equal(morning.candidates.length, 1);
  assert.equal(morning.candidates[0]?.dedupeKey, `closing:today:fixture-mills:${today}`);

  const unconfigured = evaluateAlerts({
    now: afternoon,
    preferences: preferences({ closing: true }),
    issues: [issue({ openDate: null, closeDate: today, status: "open" })],
    baselines: new Map(),
  });
  assert.equal(unconfigured.candidates[0]?.dedupeKey, `closing:today:fixture-mills:${today}`);

  const stale = evaluateAlerts({
    now: afternoon,
    preferences: preferences({ closing: true }),
    issues: [issue({ openDate: null, closeDate: today, freshness: "stale" })],
    baselines: new Map(),
    closeHourIst: 17,
  });
  assert.equal(stale.candidates.length, 0);
});

test("announcements are stored without email and start with push not-sent", async () => {
  assert.equal(announcementCandidate({ key: "bad key", title: "Hello", body: "There" }), null);
  const store = createMemoryNotificationStore();
  const skipped = await deliverAnnouncement({
    notifications: store,
    userId: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f",
    key: "october-note",
    title: "October note",
    body: "IPO Singh has a site notice.",
    enabled: false,
  });
  assert.equal(skipped, "skipped");
  const created = await deliverAnnouncement({
    notifications: store,
    userId: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f",
    key: "october-note",
    title: "October note",
    body: "IPO Singh has a site notice.",
    enabled: true,
    now,
  });
  assert.equal(created, "created");
  const again = await deliverAnnouncement({
    notifications: store,
    userId: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f",
    key: "october-note",
    title: "October note",
    body: "IPO Singh has a site notice.",
    enabled: true,
    now,
  });
  assert.equal(again, "duplicate");
  const rows = await store.listForUser("018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f", now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.delivery.push, "not-sent");
  assert.equal(JSON.stringify(rows[0]).includes("email"), false);
});
