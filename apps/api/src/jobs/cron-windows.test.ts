import assert from "node:assert/strict";
import test from "node:test";
import { defaultCronPolicy, readCronPolicy, syncPolicyForCronPass } from "../config/cron-policy.ts";
import { defaultSyncPolicy } from "../config/sync-policy.ts";
import { createSyncLock } from "./lock.ts";
import {
  isAllotmentCronWindowOpen,
  isTaskDue,
  isTaskWindowOpen,
  isWithinIstWindow,
  istMinuteOfDay,
  planCronTaskGates,
} from "./cron-windows.ts";
import { cronPassLockName, runCronPass } from "./cron-pass.ts";
import { planAllotmentCheck } from "./allotment/schedule.ts";

test("IST minute windows include both ends and wrap past midnight", () => {
  // 9:00–18:00 IST
  assert.equal(isWithinIstWindow(9 * 60, { startMinute: 9 * 60, endMinute: 18 * 60 }), true);
  assert.equal(isWithinIstWindow(18 * 60, { startMinute: 9 * 60, endMinute: 18 * 60 }), true);
  assert.equal(isWithinIstWindow(8 * 60 + 59, { startMinute: 9 * 60, endMinute: 18 * 60 }), false);
  assert.equal(isWithinIstWindow(18 * 60 + 1, { startMinute: 9 * 60, endMinute: 18 * 60 }), false);

  // 21:00–01:00 IST (wrap)
  const overnight = { startMinute: 21 * 60, endMinute: 1 * 60 };
  assert.equal(isWithinIstWindow(21 * 60, overnight), true);
  assert.equal(isWithinIstWindow(23 * 60 + 59, overnight), true);
  assert.equal(isWithinIstWindow(0, overnight), true);
  assert.equal(isWithinIstWindow(1 * 60, overnight), true); // final 1:00 AM check
  assert.equal(isWithinIstWindow(1 * 60 + 1, overnight), false);
  assert.equal(isWithinIstWindow(20 * 60 + 59, overnight), false);
});

test("UTC instants convert to Asia/Kolkata for window checks", () => {
  // 2026-11-10 15:30 UTC = 21:00 IST
  const ninePm = new Date("2026-11-10T15:30:00.000Z");
  assert.equal(istMinuteOfDay(ninePm), 21 * 60);
  assert.equal(isTaskWindowOpen(ninePm, { startMinute: 21 * 60, endMinute: 1 * 60 }), true);

  // 2026-11-10 19:30 UTC = 01:00 IST next calendar day
  const oneAm = new Date("2026-11-10T19:30:00.000Z");
  assert.equal(istMinuteOfDay(oneAm), 1 * 60);
  assert.equal(isTaskWindowOpen(oneAm, { startMinute: 21 * 60, endMinute: 1 * 60 }), true);

  // 2026-11-10 03:30 UTC = 09:00 IST
  const nineAm = new Date("2026-11-10T03:30:00.000Z");
  assert.equal(istMinuteOfDay(nineAm), 9 * 60);
  assert.equal(isTaskWindowOpen(nineAm, defaultCronPolicy().catalogWindow), true);
  // 09:00 IST is inside the morning allotment follow-up (08:00–10:00); use midday instead.
  const midday = new Date("2026-11-10T07:00:00.000Z"); // 12:30 IST
  assert.equal(istMinuteOfDay(midday), 12 * 60 + 30);
  assert.equal(isAllotmentCronWindowOpen(midday, defaultCronPolicy()), false);
});

test("nighttime inactivity closes provider windows outside business hours", () => {
  const policy = defaultCronPolicy();
  // 2026-11-10 20:00 UTC = 01:30 IST — after final allotment check, before morning
  const lateNight = new Date("2026-11-10T20:00:00.000Z");
  const gates = planCronTaskGates({
    now: lateNight,
    policy,
    allotmentVerifyEnabled: true,
    providerReady: true,
  });
  assert.equal(gates.catalog, false);
  assert.equal(gates.gmpCollection, false);
  assert.equal(gates.subscriptionCurrent, false);
  assert.equal(gates.ipoDetail, false);
  assert.equal(gates.allotment, false);
  assert.equal(gates.alerts, true);
});

test("allotment overnight window starts at 9 PM and continues through 1 AM", () => {
  const policy = defaultCronPolicy();
  assert.equal(isAllotmentCronWindowOpen(new Date("2026-11-10T15:30:00.000Z"), policy), true); // 21:00
  assert.equal(isAllotmentCronWindowOpen(new Date("2026-11-10T16:00:00.000Z"), policy), true); // 21:30
  assert.equal(isAllotmentCronWindowOpen(new Date("2026-11-10T18:30:00.000Z"), policy), true); // 00:00
  assert.equal(isAllotmentCronWindowOpen(new Date("2026-11-10T19:30:00.000Z"), policy), true); // 01:00
  assert.equal(isAllotmentCronWindowOpen(new Date("2026-11-10T19:31:00.000Z"), policy), false); // 01:01
  assert.equal(isAllotmentCronWindowOpen(new Date("2026-11-10T15:29:00.000Z"), policy), false); // 20:59
});

test("morning allotment follow-up window is separate from overnight", () => {
  const policy = defaultCronPolicy();
  // 08:30 IST
  assert.equal(isAllotmentCronWindowOpen(new Date("2026-11-11T03:00:00.000Z"), policy), true);
  // 10:00 IST inclusive
  assert.equal(isAllotmentCronWindowOpen(new Date("2026-11-11T04:30:00.000Z"), policy), true);
  // 10:01 IST
  assert.equal(isAllotmentCronWindowOpen(new Date("2026-11-11T04:31:00.000Z"), policy), false);
});

test("allotment date eligibility continues after midnight for the previous allotment day", () => {
  const beforeMidnight = planAllotmentCheck({
    now: new Date("2026-11-10T18:00:00.000Z"), // 23:30 IST on allotment date
    allotmentDate: "2026-11-10",
    closeDate: "2026-11-05",
    allotmentConfirmed: false,
    status: "closed",
    lastCheckedAt: "2026-11-10T17:45:00.000Z",
    nextCheckAt: "2026-11-10T18:00:00.000Z",
  });
  assert.equal(beforeMidnight.due, true);

  const afterMidnight = planAllotmentCheck({
    now: new Date("2026-11-10T19:00:00.000Z"), // 00:30 IST on Nov 11
    allotmentDate: "2026-11-10",
    closeDate: "2026-11-05",
    allotmentConfirmed: false,
    status: "closed",
    lastCheckedAt: "2026-11-10T18:15:00.000Z",
    nextCheckAt: "2026-11-10T18:30:00.000Z",
  });
  assert.equal(afterMidnight.due, true);
  assert.notEqual(afterMidnight.reason, "before-monitor-start");

  const finalCheck = planAllotmentCheck({
    now: new Date("2026-11-10T19:30:00.000Z"), // 01:00 IST
    allotmentDate: "2026-11-10",
    closeDate: "2026-11-05",
    allotmentConfirmed: false,
    status: "allotment",
    lastCheckedAt: "2026-11-10T19:15:00.000Z",
    nextCheckAt: "2026-11-10T19:30:00.000Z",
  });
  assert.equal(finalCheck.due, true);
});

test("task due respects interval inside an open window", () => {
  const window = { startMinute: 9 * 60, endMinute: 18 * 60 };
  const now = new Date("2026-11-10T04:00:00.000Z"); // 09:30 IST
  assert.equal(
    isTaskDue({ now, window, intervalMs: 30 * 60 * 1000, lastSuccessAt: null }),
    true,
  );
  assert.equal(
    isTaskDue({
      now,
      window,
      intervalMs: 30 * 60 * 1000,
      lastSuccessAt: new Date(now.getTime() - 10 * 60 * 1000),
    }),
    false,
  );
  assert.equal(
    isTaskDue({
      now,
      window,
      intervalMs: 30 * 60 * 1000,
      lastSuccessAt: new Date(now.getTime() - 31 * 60 * 1000),
    }),
    true,
  );
});

test("cron policy defaults match the Prompt 86 IST schedule", () => {
  const policy = readCronPolicy({});
  assert.equal(policy.catalogIntervalMs, 30 * 60 * 1000);
  assert.equal(policy.gmpIntervalMs, 30 * 60 * 1000);
  assert.equal(policy.subscriptionIntervalMs, 10 * 60 * 1000);
  assert.equal(policy.detailIntervalMs, 2 * 60 * 60 * 1000);
  assert.equal(policy.allotmentIntervalMs, 15 * 60 * 1000);
  assert.equal(policy.catalogWindow.startMinute, 9 * 60);
  assert.equal(policy.catalogWindow.endMinute, 18 * 60);
  assert.equal(policy.gmpWindow.endMinute, 17 * 60);
  assert.equal(policy.subscriptionWindow.startMinute, 10 * 60);
  assert.equal(policy.allotmentOvernightWindow.startMinute, 21 * 60);
  assert.equal(policy.allotmentOvernightWindow.endMinute, 1 * 60);
});

test("syncPolicyForCronPass shortens catalogue and open subscription without raising GMP collection min", () => {
  const base = defaultSyncPolicy();
  const cron = defaultCronPolicy();
  const merged = syncPolicyForCronPass(base, cron);
  assert.equal(merged.catalogMs, 30 * 60 * 1000);
  assert.equal(merged.subscription.openMs, 10 * 60 * 1000);
  assert.equal(merged.financial.openMs, 2 * 60 * 60 * 1000);
  assert.equal(merged.gmpCollectionMs, base.gmpCollectionMs);
  assert.ok(merged.gmpCollectionMs >= 60 * 60 * 1000);
});

test("duplicate cron invocations are prevented by the pass lock", async () => {
  const locks = createSyncLock(null, { allowProcessLocal: true });
  const first = await locks.acquire(cronPassLockName, 60_000);
  assert.ok(first);
  const second = await locks.acquire(cronPassLockName, 60_000);
  assert.equal(second, null);
  await first();
  const third = await locks.acquire(cronPassLockName, 60_000);
  assert.ok(third);
  await third();
});

test("runCronPass skips work when the pass lock is held", async () => {
  const locks = createSyncLock(null, { allowProcessLocal: true });
  const held = await locks.acquire(cronPassLockName, 60_000);
  assert.ok(held);

  const logs: string[] = [];
  const summary = await runCronPass({
    now: () => new Date("2026-11-10T04:00:00.000Z"),
    cronPolicy: defaultCronPolicy(),
    syncContext: null,
    allotmentVerifyEnabled: false,
    database: { store: null } as never,
    cache: { store: null, service: {} as never, quota: {} as never, close: async () => undefined } as never,
    locks,
    alertPolicy: {
      gmpChangeRupees: 10,
      batchSize: 40,
      maxAttempts: 3,
      lockMs: 60_000,
      closeHourIst: null,
      mainboardMaxNonCriticalPerDay: 3,
      pushDeliveryEnabled: false,
    },
    logger: {
      debug() {},
      info(message: string) {
        logs.push(message);
      },
      warn() {},
      error() {},
    },
    allotmentStore: {} as never,
    allotmentNotifier: async () => ({ dispatch: "skipped", eligibleDevices: 0, queuedUsers: 0 }),
    expoAccessToken: null,
  });

  assert.equal(summary.skippedOverlap, true);
  assert.equal(summary.alertsRan, false);
  assert.match(logs.join("\n"), /holds the lock/);
  await held();
});
