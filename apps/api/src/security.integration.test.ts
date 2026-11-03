import { apiErrorSchema } from "@ipo-singh/contracts";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { defaultCachePolicy } from "./config/cache-policy.ts";
import type { AppConfig } from "./config/env.ts";
import { defaultHttpLimits } from "./config/http-limits.ts";
import { defaultQuotaPolicy } from "./config/quota.ts";
import { disabledIpoGuruConfig } from "./config/ipoguru.ts";
import type { DatabaseHandle } from "./db/handle.ts";
import { startServer, type RunningServer } from "./index.ts";
import { encodeCursor } from "./modules/catalog/query.ts";
import { createLogger } from "./shared/logger.ts";
import { readyResponseSchema } from "./modules/health/schema.ts";

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    deployment: "test",
    host: "127.0.0.1",
    port: 0,
    corsOrigins: ["http://localhost:3000"],
    logLevel: "error",
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

const quiet = createLogger({ level: "error", service: "ipo-singh-api", sink: () => undefined });

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

describe("API safeguards", () => {
  const servers: RunningServer[] = [];

  after(async () => {
    await Promise.all(servers.map((server) => server.shutdown()));
  });

  it("rate limits catalogue, search, and detail reads and leaves health available", async () => {
    const server = await startServer(
      config({
        rateLimit: { windowMs: 60_000, cataloguePerWindow: 2, searchPerWindow: 1, detailPerWindow: 1, authPerWindow: 1, adminPerWindow: 1 },
      }),
      quiet,
    );
    servers.push(server);
    const headers = { connection: "close" };
    const first = await fetch(`${server.url}/api/v1/ipos`, { headers });
    const second = await fetch(`${server.url}/api/v1/ipos`, { headers });
    const third = await fetch(`${server.url}/api/v1/ipos`, { headers });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    const limited = apiErrorSchema.parse(await readJson(third));
    assert.equal(limited.code, "rate_limited");
    assert.match(third.headers.get("retry-after") ?? "", /^[1-9][0-9]*$/);
    await first.arrayBuffer();
    await second.arrayBuffer();

    const health = await fetch(`${server.url}/api/v1/health`, { headers });
    assert.equal(health.status, 200);
    await health.arrayBuffer();

    const search = await fetch(`${server.url}/api/v1/search?q=ab`, { headers });
    const searchAgain = await fetch(`${server.url}/api/v1/search?q=ab`, { headers });
    assert.equal(search.status, 200);
    assert.equal(searchAgain.status, 429);
    await search.arrayBuffer();
    await searchAgain.arrayBuffer();

    const detail = await fetch(`${server.url}/api/v1/ipos/missing-slug`, { headers });
    const detailAgain = await fetch(`${server.url}/api/v1/ipos/missing-slug`, { headers });
    assert.equal(detail.status, 404);
    assert.equal(detailAgain.status, 429);
    await detail.arrayBuffer();
    await detailAgain.arrayBuffer();

    const auth = await fetch(`${server.url}/api/v1/auth`, { headers });
    const authAgain = await fetch(`${server.url}/api/v1/auth`, { headers });
    assert.equal(auth.status, 404);
    assert.equal(authAgain.status, 429);
    await auth.arrayBuffer();
    await authAgain.arrayBuffer();
  });

  it("rejects PAN, short search text, deep cursors, and oversized URLs without echoing the value", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "info",
      service: "ipo-singh-api",
      sink: (line) => lines.push(line),
    });
    const server = await startServer(config(), logger);
    servers.push(server);
    const headers = { connection: "close" };
    const pan = "ABCDE1234F";

    const byKey = await fetch(`${server.url}/api/v1/search?q=ab&pan=${pan}`, { headers });
    const byKeyBody = apiErrorSchema.parse(await readJson(byKey));
    assert.equal(byKey.status, 400);
    assert.equal(byKeyBody.code, "validation_error");
    assert.equal(JSON.stringify(byKeyBody).includes(pan), false);

    const byValue = await fetch(`${server.url}/api/v1/search?q=${pan}`, { headers });
    const byValueBody = apiErrorSchema.parse(await readJson(byValue));
    assert.equal(byValue.status, 400);
    assert.equal(JSON.stringify(byValueBody).includes(pan), false);

    const posted = await fetch(`${server.url}/api/v1/health`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ applicationNumber: pan }),
    });
    const postedBody = apiErrorSchema.parse(await readJson(posted));
    assert.equal(posted.status, 400);
    assert.equal(JSON.stringify(postedBody).includes(pan), false);

    const shortSearch = await fetch(`${server.url}/api/v1/search?q=a`, { headers });
    const shortBody = apiErrorSchema.parse(await readJson(shortSearch));
    assert.equal(shortSearch.status, 400);
    assert.equal(shortBody.fieldErrors?.[0]?.field, "q");

    const wideSearch = await fetch(`${server.url}/api/v1/search?q=ab&limit=21`, { headers });
    const wideBody = apiErrorSchema.parse(await readJson(wideSearch));
    assert.equal(wideSearch.status, 400);
    assert.equal(wideBody.fieldErrors?.[0]?.field, "limit");

    const deep = await fetch(`${server.url}/api/v1/ipos?cursor=${encodeCursor(2_001)}`, { headers });
    const deepBody = apiErrorSchema.parse(await readJson(deep));
    assert.equal(deep.status, 400);
    assert.equal(deepBody.fieldErrors?.[0]?.field, "cursor");

    const markup = await fetch(`${server.url}/api/v1/search?q=${encodeURIComponent("ab<script>")}`, { headers });
    assert.equal(markup.status, 400);
    await markup.arrayBuffer();

    const longUrl = await fetch(`${server.url}/api/v1/health?${"a".repeat(2_100)}`, { headers });
    const longBody = apiErrorSchema.parse(await readJson(longUrl));
    assert.equal(longUrl.status, 400);
    assert.equal(longBody.fieldErrors?.[0]?.field, "query");

    await new Promise((resolve) => setTimeout(resolve, 20));
    const written = lines.join("\n");
    assert.equal(written.includes(pan), false);
  });

  it("rate limits anonymous device push registration with the auth budget", async () => {
    const server = await startServer(
      config({
        rateLimit: { windowMs: 60_000, cataloguePerWindow: 50, searchPerWindow: 5, detailPerWindow: 5, authPerWindow: 1, adminPerWindow: 1 },
      }),
      quiet,
    );
    servers.push(server);
    const headers = { connection: "close", "content-type": "application/json" };
    const body = JSON.stringify({
      installationId: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f",
      platform: "ios",
      token: "ExponentPushToken[abcdefghijklmnopqrst]",
      allotmentAlertsEnabled: true,
    });
    const first = await fetch(`${server.url}/api/v1/notifications/device-push-tokens`, { method: "POST", headers, body });
    const second = await fetch(`${server.url}/api/v1/notifications/device-push-tokens`, { method: "POST", headers, body });
    // Store may be unavailable (503) or accept (200); the second call must be rate-limited either way.
    assert.ok(first.status === 200 || first.status === 503);
    assert.equal(second.status, 429);
    await first.arrayBuffer();
    await second.arrayBuffer();
  });

  it("keeps admin routes closed without a session", async () => {
    const server = await startServer(config(), quiet);
    servers.push(server);
    const headers = { connection: "close" };
    const dashboard = await fetch(`${server.url}/api/v1/admin/dashboard`, { headers });
    const roles = await fetch(`${server.url}/api/v1/admin/roles`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ userId: "user-1", role: "super-admin", currentPassword: "x" }),
    });
    const sync = await fetch(`${server.url}/api/v1/admin/sync`, { method: "POST", headers });
    assert.equal(dashboard.status, 401);
    assert.equal(roles.status, 401);
    assert.equal(sync.status, 401);
    await dashboard.arrayBuffer();
    await roles.arrayBuffer();
    await sync.arrayBuffer();
  });

  it("returns not ready when a database check does not finish", async () => {
    const hanging: DatabaseHandle = {
      async check() {
        return new Promise(() => undefined);
      },
      async close() {
        return undefined;
      },
    };
    const server = await startServer(config(), quiet, hanging);
    servers.push(server);
    const started = Date.now();
    const response = await fetch(`${server.url}/api/v1/ready`, { headers: { connection: "close" } });
    const body = readyResponseSchema.parse(await readJson(response));
    assert.equal(response.status, 503);
    assert.equal(body.status, "not_ready");
    assert.equal(body.checks.database, "unavailable");
    assert.equal(body.checks.provider, "not_configured");
    assert.equal(body.checks.jobs, "not_configured");
    assert.ok(Date.now() - started < 5_000);
    assert.equal(JSON.stringify(body).includes("mongodb"), false);
  });
});
