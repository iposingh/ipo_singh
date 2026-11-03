import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { apiErrorSchema, ipoSummarySchema, pageSchema } from "@ipo-singh/contracts";
import { defaultCachePolicy } from "./config/cache-policy.ts";
import type { AppConfig } from "./config/env.ts";
import { defaultHttpLimits } from "./config/http-limits.ts";
import { defaultQuotaPolicy } from "./config/quota.ts";
import { disabledIpoGuruConfig } from "./config/ipoguru.ts";
import { createUnconfiguredCache } from "./cache/connection.ts";
import { startServer, type RunningServer } from "./index.ts";
import { createLogger } from "./shared/logger.ts";
import { healthResponseSchema, readyResponseSchema } from "./modules/health/schema.ts";

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
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
    provider: null,
    ipoGuru: disabledIpoGuruConfig(),
    internalServiceToken: null,
    opsToken: null,
    ...overrides,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

describe("HTTP API", () => {
  const lines: string[] = [];
  let running: RunningServer | undefined;

  before(async () => {
    const logger = createLogger({
      level: "info",
      service: "ipo-singh-api",
      sink: (line) => lines.push(line),
    });
    running = await startServer(testConfig(), logger);
  });

  after(async () => {
    await running?.shutdown();
  });

  it("reports liveness and readiness without claiming a database, cache, or provider", async () => {
    const server = requiredServer(running);
    const health = await fetch(`${server.url}/api/v1/health`, { headers: { connection: "close" } });
    const healthBody = await readJson(health);
    assert.equal(health.status, 200);
    assert.equal(healthResponseSchema.safeParse(healthBody).success, true);
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("x-powered-by"), null);
    assert.match(health.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    assert.match(health.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.equal(health.headers.get("referrer-policy"), "no-referrer");
    assert.equal(health.headers.get("x-frame-options"), "DENY");
    assert.equal(health.headers.get("strict-transport-security"), null);
    assert.equal(health.headers.get("cache-control"), "no-store");
    assert.match(health.headers.get("content-type") ?? "", /^application\/json/);
    if (healthResponseSchema.safeParse(healthBody).success) {
      assert.match(healthResponseSchema.parse(healthBody).timestampIst, /IST$/);
    }

    const ready = await fetch(`${server.url}/api/v1/ready`, { headers: { connection: "close" } });
    const readyBody = await readJson(ready);
    assert.equal(ready.status, 200);
    const parsed = readyResponseSchema.parse(readyBody);
    assert.equal(parsed.status, "ready");
    assert.deepEqual(parsed.checks, {
      process: "ok",
      database: "not_configured",
      cache: "not_configured",
      provider: "not_configured",
      jobs: "not_configured",
    });
  });

  it("returns an empty catalogue when the database is not configured", async () => {
    const server = requiredServer(running);
    const response = await fetch(`${server.url}/api/v1/ipos`, { headers: { connection: "close" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const page = pageSchema(ipoSummarySchema).parse(await readJson(response));
    assert.deepEqual(page.items, []);
    assert.equal(page.page.totalCount, 0);
    assert.equal(page.page.nextCursor, null);

    const search = await fetch(`${server.url}/api/v1/search?q=fixture`, { headers: { connection: "close" } });
    const searchPage = pageSchema(ipoSummarySchema).parse(await readJson(search));
    assert.equal(search.status, 200);
    assert.equal(searchPage.page.totalCount, 0);

    const missing = await fetch(`${server.url}/api/v1/ipos/fixture-polymers`, { headers: { connection: "close" } });
    assert.equal(missing.status, 404);
    assert.equal(apiErrorSchema.parse(await readJson(missing)).code, "not_found");

    for (const path of ["/api/v1/gmp", "/api/v1/subscriptions", "/api/v1/auth", "/api/v1/sync"]) {
      const unmatched = await fetch(`${server.url}${path}`, { headers: { connection: "close" } });
      const body = apiErrorSchema.parse(await readJson(unmatched));
      assert.equal(unmatched.status, 404);
      assert.equal(body.code, "not_found");
    }
  });

  it("applies CORS only to configured origins", async () => {
    const server = requiredServer(running);
    const allowed = await fetch(`${server.url}/api/v1/health`, {
      headers: { origin: "http://localhost:3000", connection: "close" },
    });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:3000");
    await allowed.arrayBuffer();

    const blocked = await fetch(`${server.url}/api/v1/health`, {
      headers: { origin: "http://evil.example", connection: "close" },
    });
    assert.equal(blocked.headers.get("access-control-allow-origin"), null);
    await blocked.arrayBuffer();

    const preflight = await fetch(`${server.url}/api/v1/health`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
        connection: "close",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:3000");
    await preflight.arrayBuffer();
  });

  it("echoes a safe request id and replaces an unsafe one", async () => {
    const server = requiredServer(running);
    const safe = await fetch(`${server.url}/api/v1/health`, {
      headers: { "x-request-id": "req_123", connection: "close" },
    });
    assert.equal(safe.headers.get("x-request-id"), "req_123");
    await safe.arrayBuffer();

    const unsafe = await fetch(`${server.url}/api/v1/health`, {
      headers: { "x-request-id": "bad id", connection: "close" },
    });
    const replacement = unsafe.headers.get("x-request-id");
    assert.notEqual(replacement, "bad id");
    assert.match(replacement ?? "", /^[0-9a-f-]{36}$/);
    await unsafe.arrayBuffer();
  });

  it("rejects invalid JSON and oversized bodies", async () => {
    const server = requiredServer(running);
    const invalid = await fetch(`${server.url}/api/v1/health`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: "{",
    });
    const invalidBody = apiErrorSchema.parse(await readJson(invalid));
    assert.equal(invalid.status, 400);
    assert.equal(invalidBody.code, "validation_error");
    assert.equal(invalidBody.message, "Request body must be valid JSON.");

    const oversized = await fetch(`${server.url}/api/v1/health`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ pad: "x".repeat(2048) }),
    });
    const oversizedBody = apiErrorSchema.parse(await readJson(oversized));
    assert.equal(oversized.status, 413);
    assert.equal(oversizedBody.message, "Request body exceeds the size limit.");
  });

  it("redacts authorization headers and query secrets from request logs", async () => {
    const server = requiredServer(running);
    const before = lines.length;
    const response = await fetch(`${server.url}/api/v1/health?apiKey=super-secret-value`, {
      headers: { authorization: "Bearer super-secret-value", connection: "close" },
    });
    await response.arrayBuffer();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const written = lines.slice(before).join("\n");
    assert.match(written, /\[redacted\]/);
    assert.equal(written.includes("super-secret-value"), false);
    assert.equal(written.includes("apiKey"), false);
  });

  it("reports not ready during shutdown while liveness still responds", async () => {
    const server = requiredServer(running);
    server.state.accepting = false;
    try {
      const ready = await fetch(`${server.url}/api/v1/ready`, { headers: { connection: "close" } });
      const readyBody = readyResponseSchema.parse(await readJson(ready));
      assert.equal(ready.status, 503);
      assert.equal(readyBody.status, "not_ready");
      assert.equal(readyBody.checks.process, "shutting_down");

      const health = await fetch(`${server.url}/api/v1/health`, { headers: { connection: "close" } });
      assert.equal(health.status, 200);
      await health.arrayBuffer();
    } finally {
      server.state.accepting = true;
    }
  });
});

describe("database readiness", () => {
  it("reports an unavailable database without failing liveness", async () => {
    const logger = createLogger({ level: "error", service: "test", sink: () => undefined });
    const running = await startServer(testConfig(), logger, {
      async check() {
        return "unavailable";
      },
      async close() {
        return undefined;
      },
    });
    try {
      const ready = await fetch(`${running.url}/api/v1/ready`, { headers: { connection: "close" } });
      const readyBody = readyResponseSchema.parse(await readJson(ready));
      assert.equal(ready.status, 503);
      assert.equal(readyBody.status, "not_ready");
      assert.equal(readyBody.checks.database, "unavailable");
      const health = await fetch(`${running.url}/api/v1/health`, { headers: { connection: "close" } });
      assert.equal(health.status, 200);
      await health.arrayBuffer();
    } finally {
      await running.shutdown();
    }
  });
});

describe("cache readiness", () => {
  it("stays ready when Redis is configured but unavailable", async () => {
    const logger = createLogger({ level: "error", service: "test", sink: () => undefined });
    const config = testConfig();
    const cache = createUnconfiguredCache(config.cache, config.quota, logger);
    const running = await startServer(config, logger, undefined, {
      ...cache,
      async check() {
        return "unavailable";
      },
    });
    try {
      const ready = await fetch(`${running.url}/api/v1/ready`, { headers: { connection: "close" } });
      const readyBody = readyResponseSchema.parse(await readJson(ready));
      assert.equal(ready.status, 200);
      assert.equal(readyBody.checks.cache, "unavailable");
      assert.equal(readyBody.checks.provider, "not_configured");
    } finally {
      await running.shutdown();
    }
  });
});

describe("server shutdown", () => {
  it("closes the port after shutdown", async () => {
    const logger = createLogger({ level: "error", service: "test", sink: () => undefined });
    const running = await startServer(testConfig(), logger);
    assert.equal(await running.shutdown(), true);
    await assert.rejects(fetch(`${running.url}/api/v1/health`));
  });
});

function requiredServer(server: RunningServer | undefined): RunningServer {
  assert.ok(server);
  return server;
}
