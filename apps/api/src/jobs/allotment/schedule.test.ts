import assert from "node:assert/strict";
import test from "node:test";
import { allotmentMonitoringStartAt, planAllotmentCheck } from "./schedule.ts";

test("monitoring starts at 9 PM IST on the allotment date", () => {
  const start = allotmentMonitoringStartAt("2026-10-08");
  assert.ok(start);
  assert.equal(start.toISOString(), "2026-10-08T15:30:00.000Z");

  const before = planAllotmentCheck({
    now: new Date("2026-10-08T15:00:00.000Z"), // 8:30 PM IST
    allotmentDate: "2026-10-08",
    closeDate: "2026-10-03",
    allotmentConfirmed: false,
    status: "closed",
    lastCheckedAt: null,
    nextCheckAt: null,
  });
  assert.equal(before.due, false);
  assert.equal(before.reason, "before-monitor-start");
  assert.equal(before.nextCheckAt, "2026-10-08T15:30:00.000Z");
});

test("at 9 PM IST monitoring is due every 15 minutes", () => {
  const onStart = planAllotmentCheck({
    now: new Date("2026-10-08T15:30:00.000Z"),
    allotmentDate: "2026-10-08",
    closeDate: "2026-10-03",
    allotmentConfirmed: false,
    status: "closed",
    lastCheckedAt: null,
    nextCheckAt: null,
  });
  assert.equal(onStart.due, true);
  assert.equal(onStart.intervalMs, 15 * 60 * 1000);

  const waiting = planAllotmentCheck({
    now: new Date("2026-10-08T15:40:00.000Z"),
    allotmentDate: "2026-10-08",
    closeDate: "2026-10-03",
    allotmentConfirmed: false,
    status: "allotment",
    lastCheckedAt: "2026-10-08T15:30:00.000Z",
    nextCheckAt: "2026-10-08T15:45:00.000Z",
  });
  assert.equal(waiting.due, false);
  assert.equal(waiting.reason, "waiting-next-check");
});

test("confirmed and listed IPOs are not polled", () => {
  const confirmed = planAllotmentCheck({
    now: new Date("2026-10-08T16:00:00.000Z"),
    allotmentDate: "2026-10-08",
    closeDate: "2026-10-03",
    allotmentConfirmed: true,
    status: "allotment",
    lastCheckedAt: null,
    nextCheckAt: null,
  });
  assert.equal(confirmed.reason, "already-confirmed");
});
