import { apiErrorSchema } from "@ipo-singh/contracts";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { defaultCachePolicy } from "./config/cache-policy.ts";
import type { AppConfig } from "./config/env.ts";
import { defaultHttpLimits } from "./config/http-limits.ts";
import { defaultQuotaPolicy } from "./config/quota.ts";
import { disabledIpoGuruConfig } from "./config/ipoguru.ts";
import type { DatabaseHandle } from "./db/handle.ts";
import type { ProviderUsageRecord, SyncRunRecord } from "./db/records.ts";
import type { PersistenceStore } from "./db/repositories.ts";
import { startServer, type RunningServer } from "./index.ts";
import { operationsStatusSchema } from "./modules/ops/schema.ts";
import { createLogger } from "./shared/logger.ts";

const token = "development-token-1";
const successAt = new Date("2026-10-18T04:00:00.000Z");

function config(): AppConfig {
  return {
    nodeEnv: "test",
    deployment: "test",
    host: "127.0.0.1",
    port: 0,
    corsOrigins: ["http://localhost:3000"],
    logLevel: "info",
    requestBodyLimit: "1kb",
    shutdownTimeoutMs: 1000,
    ...defaultHttpLimits(),
    trustProxy: false,
    serviceName: "ipo-singh-api",
    version: "0.1.0",
    mongodb: null,
    redis: null,
    cache: defaultCachePolicy(),
    quota: defaultQuotaPolicy(),
    provider: { primary: "mock", fallback: null, timeoutMs: 8000 },
    ipoGuru: disabledIpoGuruConfig(),
    internalServiceToken: null,
    opsToken: token,
  };
}

function database(): DatabaseHandle {
  const usage: ProviderUsageRecord = {
    providerKey: "mock",
    endpoint: "/sync/catalog",
    usageId: "sync-catalog",
    requestedAt: successAt,
    statusCode: 200,
    durationMs: 15,
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  };
  const succeeded: SyncRunRecord = {
    providerKey: "mock",
    resource: "catalog-catalogue",
    startedAt: successAt,
    finishedAt: successAt,
    status: "succeeded",
    fetchedCount: 1,
    errorName: null,
    expiresAt: usage.expiresAt,
  };
  const failed: SyncRunRecord = {
    ...succeeded,
    resource: "gmp-fixture-polymers",
    startedAt: new Date("2026-10-18T05:00:00.000Z"),
    finishedAt: new Date("2026-10-18T05:00:01.000Z"),
    status: "failed",
    fetchedCount: 0,
    errorName: "SyncRejectedError",
  };
  return {
    async check() {
      return "ok";
    },
    async close() {
      return undefined;
    },
    store: {
      sync: { findByProvider: async () => [succeeded, failed] },
      usage: { findByProvider: async () => [usage] },
    } as unknown as PersistenceStore,
  };
}

describe("protected operational status", () => {
  const servers: RunningServer[] = [];

  after(async () => {
    await Promise.all(servers.map((server) => server.shutdown()));
  });

  it("hides metrics unless the operations token is sent as a header", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "info",
      service: "ipo-singh-api",
      sink: (line) => lines.push(line),
    });
    const server = await startServer(config(), logger, database());
    servers.push(server);
    const headers = { connection: "close" };

    const missing = await fetch(`${server.url}/internal/status`, { headers });
    const missingBody = apiErrorSchema.parse(await missing.json());
    assert.equal(missing.status, 404);
    assert.equal(missingBody.code, "not_found");

    const wrong = await fetch(`${server.url}/internal/status`, { headers: { ...headers, "x-ops-token": "wrong-token-value" } });
    assert.equal(wrong.status, 404);
    await wrong.arrayBuffer();

    const fromQuery = await fetch(`${server.url}/internal/status?token=${token}`, { headers });
    assert.equal(fromQuery.status, 404);
    await fromQuery.arrayBuffer();

    const account = await fetch(`${server.url}/internal/ipoguru/account`, { headers: { ...headers, "x-ops-token": token } });
    assert.equal(account.status, 404);
    await account.arrayBuffer();

    const health = await fetch(`${server.url}/api/v1/health`, { headers });
    const healthBody = await health.json();
    assert.equal(health.status, 200);
    assert.equal("providerEndpoints" in (healthBody as object), false);
    assert.equal("quota" in (healthBody as object), false);

    await fetch(`${server.url}/api/v1/ipos`, { headers }).then((response) => response.arrayBuffer());
    const opened = await fetch(`${server.url}/internal/status`, { headers: { ...headers, "x-ops-token": token } });
    const before = operationsStatusSchema.parse(await opened.json());
    assert.equal(before.provider, "mock");
    assert.equal(before.providerRequests, 1);
    assert.equal(before.providerEndpoints[0]?.latency.totalMs, 15);
    assert.equal(before.sync.succeeded, 1);
    assert.equal(before.sync.failed, 1);
    assert.equal(before.sync.lastSuccessAt, successAt.toISOString());
    assert.equal(before.dependencies.database, "ok");
    assert.equal(before.dependencies.cache, "not_configured");
    assert.equal(before.dependencies.storedMetrics, "ok");
    assert.equal(before.quota.minuteUsed, 0);
    assert.ok(before.cache.misses >= 1);
    assert.match(before.node, /^v24\./);

    const invalid = await fetch(`${server.url}/api/v1/search?q=a`, { headers });
    assert.equal(invalid.status, 400);
    await invalid.arrayBuffer();
    const again = await fetch(`${server.url}/internal/status`, { headers: { ...headers, "x-ops-token": token } });
    const after = operationsStatusSchema.parse(await again.json());
    assert.ok(after.validationFailures >= before.validationFailures + 1);

    const serialized = JSON.stringify(after);
    assert.equal(serialized.includes(token), false);
    assert.equal(serialized.includes("SyncRejectedError"), false);
    assert.equal(serialized.includes("mongodb"), false);
    const written = lines.join("\n");
    assert.equal(written.includes(token), false);
  });
});
