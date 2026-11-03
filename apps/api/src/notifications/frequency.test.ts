import assert from "node:assert/strict";
import test from "node:test";
import { countNonCriticalMainboardToday, mainboardDigestCandidate, planMainboardDeliveries } from "./frequency.ts";

const now = new Date("2026-11-03T10:00:00.000Z");

test("critical Mainboard events deliver; non-critical overflow becomes a digest", () => {
  const decisions = planMainboardDeliveries({
    now,
    alreadySentNonCriticalToday: 2,
    policy: { maxNonCriticalPerDay: 3 },
    candidates: [
      { type: "gmp", ipoId: "a", title: "GMP A", body: "body", dedupeKey: "gmp:a", board: "mainboard" },
      { type: "gmp", ipoId: "b", title: "GMP B", body: "body", dedupeKey: "gmp:b", board: "mainboard" },
      { type: "open", ipoId: "c", title: "Open C", body: "body", dedupeKey: "open:c", board: "mainboard" },
    ],
  });
  assert.equal(decisions.some((item) => item.action === "deliver" && item.candidate.type === "open"), true);
  assert.equal(decisions.filter((item) => item.action === "deliver" && item.candidate.type === "gmp").length, 1);
  assert.equal(decisions.some((item) => item.action === "digest"), true);
  const digest = mainboardDigestCandidate({
    now,
    candidates: [{ type: "gmp", ipoId: "b", title: "GMP B", body: "body", dedupeKey: "gmp:b", board: "mainboard" }],
  });
  assert.equal(digest?.ipoId, null);
  assert.equal(digest?.dedupeKey.startsWith("digest:mainboard:"), true);
});

test("non-critical counter ignores critical and digest rows", () => {
  assert.equal(
    countNonCriticalMainboardToday(
      [
        { type: "open", createdAt: now, dedupeKey: "open:x" },
        { type: "gmp", createdAt: now, dedupeKey: "gmp:x" },
        { type: "announcement", createdAt: now, dedupeKey: "digest:mainboard:2026-11-03:x" },
      ],
      now,
    ),
    1,
  );
});
