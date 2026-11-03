import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCacheService } from "../cache/service.ts";
import { createMemoryStore } from "../cache/memory-store.ts";
import { biddingPhase, defaultCachePolicy, subscriptionFreshMs } from "../config/cache-policy.ts";
import { ConfigError } from "../shared/errors.ts";
import { readConfig } from "../config/env.ts";
import { createLogger } from "../shared/logger.ts";
import { dueRefreshes, issueAmendmentChanged, refreshIssueAfterAmendment, runScheduledRefreshes } from "./refresh-plan.ts";
import { istSlotInstant } from "./ist.ts";

const policy = defaultCachePolicy();
const quiet = createLogger({ level: "error", service: "test", sink: () => undefined });

function at(iso: string): Date {
  return new Date(iso);
}

describe("refresh schedule", () => {
  it("uses the longer application TTLs", () => {
    assert.equal(policy.resources.gmp.freshMs, 120 * 60 * 1000);
    assert.equal(policy.resources.subscription.freshMs, 60 * 60 * 1000);
    assert.equal(policy.subscriptionClosingFreshMs, 30 * 60 * 1000);
    assert.equal(policy.subscriptionClosedFreshMs, 24 * 60 * 60 * 1000);
    assert.equal(policy.resources.listings.freshMs, 24 * 60 * 60 * 1000);
    assert.equal(policy.resources.issue.freshMs, 24 * 60 * 60 * 1000);
    assert.equal(policy.resources.history.freshMs, 7 * 24 * 60 * 60 * 1000);
    assert.equal(policy.resources.registrars.freshMs, 24 * 60 * 60 * 1000);
    assert.equal(policy.resources.listing.freshMs, 24 * 60 * 60 * 1000);
    assert.equal(policy.directoryRefreshMinute, 8 * 60);
    assert.deepEqual(policy.listingRefreshMinutes, [10 * 60, 11 * 60, 15 * 60 + 45]);
  });

  it("shortens subscription freshness near the close and lengthens it afterward", () => {
    const closeAt = at("2026-10-18T11:30:00.000Z");
    assert.equal(biddingPhase(at("2026-10-18T08:00:00.000Z"), closeAt, policy.subscriptionClosingLeadMs), "active");
    assert.equal(biddingPhase(at("2026-10-18T10:00:00.000Z"), closeAt, policy.subscriptionClosingLeadMs), "closing");
    assert.equal(biddingPhase(closeAt, closeAt, policy.subscriptionClosingLeadMs), "closed");
    assert.equal(biddingPhase(at("2026-10-18T10:00:00.000Z"), null, policy.subscriptionClosingLeadMs), "unknown");
    assert.equal(subscriptionFreshMs(policy, "active"), 60 * 60 * 1000);
    assert.equal(subscriptionFreshMs(policy, "unknown"), 60 * 60 * 1000);
    assert.equal(subscriptionFreshMs(policy, "closing"), 30 * 60 * 1000);
    assert.equal(subscriptionFreshMs(policy, "closed"), 24 * 60 * 60 * 1000);
  });

  it("refreshes the directory once each India morning", () => {
    const before = dueRefreshes({
      now: at("2026-10-18T02:29:00.000Z"),
      policy,
      directoryLastRefreshAt: null,
      listings: [],
    });
    assert.deepEqual(before, []);

    const due = dueRefreshes({
      now: at("2026-10-18T02:30:00.000Z"),
      policy,
      directoryLastRefreshAt: null,
      listings: [],
    });
    assert.deepEqual(due, [{ kind: "directory", resource: "listings", id: "directory", minuteOfDay: 8 * 60 }]);

    const again = dueRefreshes({
      now: at("2026-10-18T04:00:00.000Z"),
      policy,
      directoryLastRefreshAt: at("2026-10-18T02:30:00.000Z"),
      listings: [],
    });
    assert.deepEqual(again, []);

    const nextDay = dueRefreshes({
      now: at("2026-10-19T02:30:00.000Z"),
      policy,
      directoryLastRefreshAt: at("2026-10-18T02:30:00.000Z"),
      listings: [],
    });
    assert.equal(nextDay.length, 1);
  });

  it("refreshes listing-day data at 10:00 IST and at each later follow-up", () => {
    const issue = { id: "fixture-polymers", listingDate: "2026-10-18", lastRefreshAt: null };
    assert.deepEqual(
      dueRefreshes({ now: at("2026-10-18T04:29:00.000Z"), policy, directoryLastRefreshAt: issue.lastRefreshAt, listings: [issue] }).filter(
        (item) => item.kind === "listing",
      ),
      [],
    );
    const opened = dueRefreshes({
      now: at("2026-10-18T04:30:00.000Z"),
      policy,
      directoryLastRefreshAt: at("2026-10-18T02:30:00.000Z"),
      listings: [issue],
    });
    assert.deepEqual(
      opened.filter((item) => item.kind === "listing"),
      [{ kind: "listing", resource: "listing", id: "fixture-polymers", minuteOfDay: 10 * 60 }],
    );

    const followUp = dueRefreshes({
      now: at("2026-10-18T05:30:00.000Z"),
      policy,
      directoryLastRefreshAt: at("2026-10-18T02:30:00.000Z"),
      listings: [{ ...issue, lastRefreshAt: at("2026-10-18T04:30:00.000Z") }],
    });
    assert.equal(followUp.find((item) => item.kind === "listing")?.minuteOfDay, 11 * 60);

    const catchUp = dueRefreshes({
      now: at("2026-10-18T12:00:00.000Z"),
      policy,
      directoryLastRefreshAt: at("2026-10-18T02:30:00.000Z"),
      listings: [issue],
    });
    assert.deepEqual(
      catchUp.filter((item) => item.kind === "listing"),
      [{ kind: "listing", resource: "listing", id: "fixture-polymers", minuteOfDay: 15 * 60 + 45 }],
    );

    const otherDay = dueRefreshes({
      now: at("2026-10-19T04:30:00.000Z"),
      policy,
      directoryLastRefreshAt: at("2026-10-19T02:30:00.000Z"),
      listings: [{ ...issue, listingDate: null }],
    });
    assert.equal(otherDay.some((item) => item.kind === "listing"), false);
    assert.equal(istSlotInstant("2026-10-18", 10 * 60)?.toISOString(), "2026-10-18T04:30:00.000Z");
  });

  it("refreshes issue details only when an amendment token changes", () => {
    assert.equal(issueAmendmentChanged(null, "rev-2"), false);
    assert.equal(issueAmendmentChanged("rev-1", null), false);
    assert.equal(issueAmendmentChanged("rev-1", "rev-1"), false);
    assert.equal(issueAmendmentChanged("rev-1", "rev-2"), true);
  });

  it("rejects a closing TTL that is longer than the active subscription TTL", () => {
    assert.throws(
      () => readConfig({ CACHE_TTL_SUBSCRIPTION_MS: "60000", CACHE_TTL_SUBSCRIPTION_CLOSING_MS: "120000" }, "0.1.0"),
      (error: unknown) => error instanceof ConfigError && error.fields.includes("CACHE_TTL_SUBSCRIPTION_CLOSING_MS"),
    );
  });
});

describe("scheduled refresh execution", () => {
  it("serves the last value while a manual refresh is outstanding and loads once for concurrent callers", async () => {
    const now = Date.parse("2026-10-18T04:30:00.000Z");
    const store = createMemoryStore(() => now);
    const cache = createCacheService({
      store,
      policy: {
        ...policy,
        resources: { ...policy.resources, listing: { freshMs: 60_000, staleMs: 3_600_000 } },
      },
      logger: quiet,
      now: () => new Date(now),
      sleep: async () => undefined,
    });
    let loads = 0;
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    await cache.getOrLoad({
      namespace: "provider",
      resource: "listing",
      id: "fixture-polymers",
      load: async () => ({ label: "first" }),
      parse: (value) => value as { label: string },
    });
    const due = [{ kind: "listing" as const, resource: "listing" as const, id: "fixture-polymers", minuteOfDay: 10 * 60 }];
    const load = async () => {
      loads += 1;
      entered();
      await hold;
      return { label: "follow-up" };
    };
    const parse = (value: unknown) => value as { label: string };
    const first = runScheduledRefreshes({ due, cache, load, parse });
    const second = runScheduledRefreshes({ due, cache, load, parse });
    await started;
    const seen = await cache.getOrLoad({
      namespace: "provider",
      resource: "listing",
      id: "fixture-polymers",
      revalidate: false,
      load: async () => ({ label: "should-not-run" }),
      parse,
    });
    assert.equal(seen.freshness, "stale");
    assert.equal(seen.value.label, "first");
    release();
    await Promise.all([first, second]);
    assert.equal(loads, 1);
    const current = await cache.getOrLoad({
      namespace: "provider",
      resource: "listing",
      id: "fixture-polymers",
      revalidate: false,
      load,
      parse,
    });
    assert.equal(current.value.label, "follow-up");
    assert.equal(current.freshness, "fresh");
  });

  it("expires an amended issue without deleting the last known value", async () => {
    let now = Date.parse("2026-10-18T04:30:00.000Z");
    const cache = createCacheService({
      store: createMemoryStore(() => now),
      policy,
      logger: quiet,
      now: () => new Date(now),
    });
    await cache.getOrLoad({
      namespace: "public",
      resource: "issue",
      id: "fixture-polymers",
      load: async () => ({ label: "original" }),
      parse: (value) => value as { label: string },
    });
    assert.equal(await refreshIssueAfterAmendment(cache, "fixture-polymers", "rev-1", "rev-1"), false);
    assert.equal(await refreshIssueAfterAmendment(cache, "fixture-polymers", "rev-1", "rev-2"), true);
    now += 1;
    const stale = await cache.getOrLoad({
      namespace: "public",
      resource: "issue",
      id: "fixture-polymers",
      revalidate: false,
      load: async () => ({ label: "replacement" }),
      parse: (value) => value as { label: string },
    });
    assert.equal(stale.freshness, "stale");
    assert.equal(stale.value.label, "original");
  });
});
