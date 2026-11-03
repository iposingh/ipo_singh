import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createUnconfiguredCache } from "../../cache/connection.ts";
import { readConfig } from "../../config/env.ts";
import { unconfiguredDatabase } from "../../db/handle.ts";
import type { ProviderUsageRecord, SyncRunRecord } from "../../db/records.ts";
import type { PersistenceStore } from "../../db/repositories.ts";
import { createLogger } from "../../shared/logger.ts";
import { buildOperationsStatus } from "./status.ts";

const quiet = createLogger({ level: "error", service: "test", sink: () => undefined });
const expiresAt = new Date("2027-01-01T00:00:00.000Z");
const successAt = new Date("2026-10-18T04:00:00.000Z");
const failureAt = new Date("2026-10-18T05:00:00.000Z");

function usage(endpoint: string, durationMs: number | null): ProviderUsageRecord {
  return {
    providerKey: "mock",
    endpoint,
    usageId: endpoint.replaceAll("/", "-"),
    requestedAt: successAt,
    statusCode: 200,
    durationMs,
    expiresAt,
  };
}

function run(status: SyncRunRecord["status"], finishedAt: Date, errorName: string | null): SyncRunRecord {
  return {
    providerKey: "mock",
    resource: status === "succeeded" ? "catalog-catalogue" : "gmp-fixture-polymers",
    startedAt: finishedAt,
    finishedAt,
    status,
    fetchedCount: status === "succeeded" ? 2 : 0,
    errorName,
    expiresAt,
  };
}

describe("operations status", () => {
  it("reports an empty process when no provider or database is configured", async () => {
    const config = readConfig({}, "0.1.0");
    const cache = createUnconfiguredCache(config.cache, config.quota, quiet);
    const status = await buildOperationsStatus(config, unconfiguredDatabase, cache, successAt);
    assert.equal(status.provider, "not_configured");
    assert.equal(status.providerRequests, 0);
    assert.deepEqual(status.providerEndpoints, []);
    assert.equal(status.sync.lastSuccessAt, null);
    assert.equal(status.dependencies.database, "not_configured");
    assert.equal(status.dependencies.cache, "not_configured");
    assert.equal(status.dependencies.storedMetrics, "not_configured");
    assert.equal(status.ipoGuru.enabled, false);
    assert.equal(status.ipoGuru.account, null);
    assert.equal(status.push.lastDeliveryStatus, null);
    assert.equal(status.push.sent, 0);
    assert.equal(status.quota.minuteLimit, 30);
    assert.equal(status.quota.dayLimit, 1_000);
    assert.equal(JSON.stringify(status).includes("mongodb"), false);
  });

  it("summarizes stored provider calls and sync results without error names", async () => {
    const config = readConfig({ IPO_DATA_PROVIDER: "mock" }, "0.1.0");
    const cache = createUnconfiguredCache(config.cache, config.quota, quiet);
    const rows = [usage("/sync/catalog", 15), usage("/sync/gmp", 30), usage("/sync/catalog", null)];
    const runs = [run("succeeded", successAt, null), run("failed", failureAt, "SyncRejectedError"), run("running", failureAt, null)];
    const database = {
      async check() {
        return "ok" as const;
      },
      async close() {
        return undefined;
      },
      store: {
        sync: { findByProvider: async () => runs },
        usage: { findByProvider: async () => rows },
      } as unknown as PersistenceStore,
    };
    const status = await buildOperationsStatus(config, database, cache, failureAt);
    assert.equal(status.provider, "mock");
    assert.equal(status.providerRequests, 3);
    assert.equal(status.providerEndpoints[0]?.endpoint, "/sync/catalog");
    assert.equal(status.providerEndpoints[0]?.requests, 2);
    assert.deepEqual(status.providerEndpoints[0]?.latency, { samples: 1, totalMs: 15, maxMs: 15 });
    assert.equal(status.providerEndpoints[1]?.endpoint, "/sync/gmp");
    assert.equal(status.sync.succeeded, 1);
    assert.equal(status.sync.failed, 1);
    assert.equal(status.sync.lastSuccessAt, successAt.toISOString());
    assert.equal(status.dependencies.storedMetrics, "ok");
    const serialized = JSON.stringify(status);
    assert.equal(serialized.includes("SyncRejectedError"), false);
    assert.equal(serialized.includes("running"), false);
  });
});
