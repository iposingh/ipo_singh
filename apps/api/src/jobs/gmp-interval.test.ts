import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError } from "../shared/errors.ts";
import { defaultSyncPolicy, gmpCollectionDefaultMs, gmpCollectionMaxMs, gmpCollectionMinMs, readSyncPolicy } from "../config/sync-policy.ts";
import { gmpCollectionIntervalMs, gmpCollectionReading } from "./gmp-interval.ts";

describe("GMP collection interval", () => {
  it("starts at 90 minutes and accepts 60 to 120", () => {
    assert.equal(defaultSyncPolicy().gmpCollectionMs, gmpCollectionDefaultMs);
    assert.equal(readSyncPolicy({ SYNC_GMP_COLLECTION_MS: String(gmpCollectionMinMs) }).gmpCollectionMs, gmpCollectionMinMs);
    assert.equal(readSyncPolicy({ SYNC_GMP_COLLECTION_MS: String(gmpCollectionMaxMs) }).gmpCollectionMs, gmpCollectionMaxMs);
    assert.throws(
      () => readSyncPolicy({ SYNC_GMP_COLLECTION_MS: String(30 * 60 * 1000) }),
      (error: unknown) => error instanceof ConfigError && error.fields.includes("SYNC_GMP_COLLECTION_MS"),
    );
  });

  it("waits longer when the day budget is tight and shorter when a reading is stale", () => {
    const budget = { configuredMs: gmpCollectionDefaultMs, dayUsed: 10, requestsPerDay: 1_000, reservedRequests: 50 };
    assert.equal(gmpCollectionIntervalMs({ ...budget, reading: "fresh" }), gmpCollectionDefaultMs);
    assert.equal(gmpCollectionIntervalMs({ ...budget, reading: "stale" }), gmpCollectionMinMs);
    assert.equal(gmpCollectionIntervalMs({ ...budget, reading: "missing" }), gmpCollectionMinMs);
    assert.equal(
      gmpCollectionIntervalMs({ ...budget, reading: "stale", dayUsed: 960 }),
      gmpCollectionMaxMs,
    );
    const now = new Date("2026-09-22T10:00:00.000Z");
    assert.equal(
      gmpCollectionReading({
        liveCount: 1,
        observedAt: [new Date("2026-09-22T09:00:00.000Z")],
        now,
        freshMs: gmpCollectionDefaultMs,
      }),
      "fresh",
    );
    assert.equal(
      gmpCollectionReading({
        liveCount: 1,
        observedAt: [new Date("2026-09-22T07:00:00.000Z")],
        now,
        freshMs: gmpCollectionDefaultMs,
      }),
      "stale",
    );
    assert.equal(gmpCollectionReading({ liveCount: 1, observedAt: [null], now, freshMs: gmpCollectionDefaultMs }), "missing");
  });
});
