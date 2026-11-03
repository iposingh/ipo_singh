import assert from "node:assert/strict";
import { createServer as createNetServer } from "node:net";
import { createServer as createTlsServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { defaultQuotaPolicy } from "../../config/quota.ts";
import { readConfig } from "../../config/env.ts";
import { ConfigError } from "../../shared/errors.ts";
import { createLogger } from "../../shared/logger.ts";
import { startServer } from "../../index.ts";
import { ProviderOutageError, QuotaExhaustedError } from "../quota.ts";
import { createIpoGuruClient, IpoGuruRequestError } from "./client.ts";
import { readEnvelope } from "./envelope.ts";
import { createHttpsTransport, IpoGuruTransportError, vendorRequestPath, type IpoGuruTransport } from "./transport.ts";

const key = "test-key-value-0001";

function accountPayload(overrides?: Record<string, unknown>): string {
  return JSON.stringify({
    success: true,
    plan: "standard",
    data: {
      name: "Acme Fintech",
      plan: "standard",
      plan_label: "Standard",
      expires_at: "2027-03-31",
      lapsed: false,
      scopes: ["calendar", "details", "details_full", "gmp", "gmp_history", "subscription", "anchors"],
      limits: { per_minute: 20, per_day: 1000, gmp_history_days: 90 },
      usage_today: { used: 3, remaining: 997, resets_at: "23 Sep 2026, 12:00 AM IST" },
      ...overrides,
    },
  });
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    "x-plan": "standard",
    "x-ratelimit-limit": "1000",
    "x-ratelimit-remaining": "997",
    ...extra,
  };
}

function listen(server: { listen: (port: number, host: string, callback: () => void) => void; address: () => { port?: number } | string | null }): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address?.port ? address.port : 0);
    });
  });
}

describe("IPO Guru envelope", () => {
  it("treats an empty collection as empty data and a failed envelope as a failure", () => {
    assert.deepEqual(readEnvelope(JSON.stringify({ success: true, plan: "free", count: 0, data: [] })), {
      kind: "empty",
      plan: "free",
      count: 0,
    });
    assert.equal(readEnvelope(JSON.stringify({ success: false, error: "plan_upgrade_required" })).kind, "failure");
    assert.equal(readEnvelope("not-json").kind, "malformed");
    assert.equal(readEnvelope(JSON.stringify({ success: true, plan: "free", count: 2, data: [] })).kind, "malformed");
  });
});

describe("IPO Guru client", () => {
  it("reads GET /me, keeps the key out of logs, and stores the vendor quota headers", async () => {
    const lines: string[] = [];
    const seen: string[] = [];
    const transport: IpoGuruTransport = async (request) => {
      seen.push(request.url);
      assert.equal(request.headers["X-API-KEY"], key);
      assert.equal(request.hostname, "www.ipoguru.in");
      return { status: 200, headers: headers(), body: accountPayload() };
    };
    const config = readConfig(
      {
        IPOGURU_ENABLED: "true",
        IPOGURU_API_KEY: key,
        IPOGURU_MINUTE_BUDGET: "20",
        IPOGURU_DAILY_BUDGET: "1000",
      },
      "0.1.0",
    );
    const client = createIpoGuruClient({
      settings: config.ipoGuru,
      quotaPolicy: { ...defaultQuotaPolicy(), reservedRequests: 0, maxRetries: 0 },
      logger: createLogger({ level: "info", service: "test", sink: (line) => lines.push(line) }),
      transport,
      now: () => new Date("2026-10-19T08:00:00.000Z"),
    });
    const account = await client.readAccount();
    assert.equal(account.plan, "standard");
    assert.equal(account.planLabel, "Standard");
    assert.equal(account.expiresAt, "2027-03-31");
    assert.equal(account.lapsed, false);
    assert.deepEqual(account.scopes, ["calendar", "details", "details_full", "gmp", "gmp_history", "subscription", "anchors"]);
    assert.deepEqual(account.limits, { perMinute: 20, perDay: 1000, gmpHistoryDays: 90 });
    assert.equal(account.usageToday.remaining, 997);
    assert.equal(JSON.stringify(account).includes("Acme"), false);
    assert.deepEqual(seen, ["https://www.ipoguru.in/api/v2/me"]);
    const monitor = await client.monitor();
    assert.equal(monitor.vendor.remaining, 997);
    assert.equal(monitor.vendor.limit, 1000);
    assert.equal(monitor.account?.plan, "standard");
    assert.equal(monitor.minuteUsed, 1);
    const written = lines.join("\n");
    assert.equal(written.includes(key), false);
    assert.equal(written.toLowerCase().includes("x-api-key"), false);
    assert.match(written, /IPO Guru response/);
  });

  it("does not call the transport when the client is disabled or the budget is exhausted", async () => {
    let calls = 0;
    const transport: IpoGuruTransport = async () => {
      calls += 1;
      return { status: 200, headers: headers(), body: accountPayload() };
    };
    const disabled = readConfig({}, "0.1.0");
    const idle = createIpoGuruClient({
      settings: disabled.ipoGuru,
      quotaPolicy: defaultQuotaPolicy(),
      logger: createLogger({ level: "error", service: "test", sink: () => undefined }),
      transport,
    });
    await assert.rejects(() => idle.readAccount());
    assert.equal((await idle.monitor()).enabled, false);
    const limited = readConfig(
      {
        IPOGURU_ENABLED: "true",
        IPOGURU_API_KEY: key,
        IPOGURU_MINUTE_BUDGET: "1",
        IPOGURU_DAILY_BUDGET: "1",
      },
      "0.1.0",
    );
    const client = createIpoGuruClient({
      settings: limited.ipoGuru,
      quotaPolicy: { ...defaultQuotaPolicy(), requestsPerMinute: 1, requestsPerDay: 1, reservedRequests: 0, maxRetries: 0 },
      logger: createLogger({ level: "error", service: "test", sink: () => undefined }),
      transport,
      now: () => new Date("2026-10-19T08:00:00.000Z"),
    });
    assert.equal((await client.readAccount()).plan, "standard");
    await assert.rejects(() => client.readAccount(), QuotaExhaustedError);
    assert.equal(calls, 1);
  });

  it("retries a hung transport once and does not retry invalid JSON, 402, or 422", async () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "warn", service: "test", sink: (line) => lines.push(line) });
    const policy = {
      ...defaultQuotaPolicy(),
      requestsPerMinute: 20,
      requestsPerDay: 50,
      reservedRequests: 0,
      maxRetries: 1,
      backoffBaseMs: 0,
      backoffMaxMs: 1_000,
      circuitFailures: 10,
    };
    const settings = readConfig(
      { IPOGURU_ENABLED: "true", IPOGURU_API_KEY: key, IPOGURU_MINUTE_BUDGET: "10", IPOGURU_DAILY_BUDGET: "20" },
      "0.1.0",
    ).ipoGuru;
    settings.connectTimeoutMs = 20;
    settings.responseTimeoutMs = 20;
    const hung = createIpoGuruClient({
      settings,
      quotaPolicy: policy,
      logger,
      transport: () => new Promise(() => undefined),
      now: () => new Date("2026-10-19T08:00:00.000Z"),
      sleep: async () => undefined,
    });
    await assert.rejects(() => hung.readAccount(), (error: unknown) => error instanceof IpoGuruRequestError && error.vendorCode === "response_timeout");

    async function once(status: number, body: string): Promise<number> {
      let calls = 0;
      const client = createIpoGuruClient({
        settings: readConfig(
          { IPOGURU_ENABLED: "true", IPOGURU_API_KEY: key, IPOGURU_MINUTE_BUDGET: "10", IPOGURU_DAILY_BUDGET: "20" },
          "0.1.0",
        ).ipoGuru,
        quotaPolicy: policy,
        logger,
        transport: async () => {
          calls += 1;
          return { status, headers: headers(), body };
        },
        now: () => new Date("2026-10-19T08:00:00.000Z"),
        sleep: async () => undefined,
      });
      await assert.rejects(() => client.readAccount(), IpoGuruRequestError);
      return calls;
    }

    assert.equal(await once(200, "not-json"), 1);
    assert.equal(
      await once(402, JSON.stringify({ success: false, error: "plan_upgrade_required", required_scope: "gmp_history" })),
      1,
    );
    assert.equal(await once(422, JSON.stringify({ success: false, message: "Invalid status." })), 1);
    assert.equal(lines.join("\n").includes(key), false);
  });

  it("waits for Retry-After on a burst 429 and does not retry a daily quota response", async () => {
    const delays: number[] = [];
    let calls = 0;
    const client = createIpoGuruClient({
      settings: readConfig(
        { IPOGURU_ENABLED: "true", IPOGURU_API_KEY: key, IPOGURU_MINUTE_BUDGET: "10", IPOGURU_DAILY_BUDGET: "20" },
        "0.1.0",
      ).ipoGuru,
      quotaPolicy: {
        ...defaultQuotaPolicy(),
        requestsPerMinute: 10,
        requestsPerDay: 20,
        reservedRequests: 0,
        maxRetries: 1,
        backoffBaseMs: 50,
        backoffMaxMs: 5_000,
        circuitFailures: 10,
      },
      logger: createLogger({ level: "error", service: "test", sink: () => undefined }),
      transport: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            status: 429,
            headers: headers({ "retry-after": "1" }),
            body: JSON.stringify({ success: false, error: "rate_limited", retry_after: 1 }),
          };
        }
        return { status: 200, headers: headers({ "x-ratelimit-remaining": "10" }), body: accountPayload() };
      },
      now: () => new Date("2026-10-19T08:00:00.000Z"),
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    assert.equal((await client.readAccount()).plan, "standard");
    assert.deepEqual(delays, [1_000]);
    assert.equal(calls, 2);

    let dailyCalls = 0;
    const daily = createIpoGuruClient({
      settings: readConfig(
        { IPOGURU_ENABLED: "true", IPOGURU_API_KEY: key, IPOGURU_MINUTE_BUDGET: "10", IPOGURU_DAILY_BUDGET: "20" },
        "0.1.0",
      ).ipoGuru,
      quotaPolicy: {
        ...defaultQuotaPolicy(),
        requestsPerMinute: 10,
        requestsPerDay: 20,
        reservedRequests: 0,
        maxRetries: 2,
        circuitFailures: 10,
      },
      logger: createLogger({ level: "error", service: "test", sink: () => undefined }),
      transport: async () => {
        dailyCalls += 1;
        return {
          status: 429,
          headers: headers(),
          body: JSON.stringify({ success: false, error: "daily_quota_reached", resets_at: "20 Oct 2026, 12:00 AM IST" }),
        };
      },
      now: () => new Date("2026-10-19T08:00:00.000Z"),
      sleep: async () => undefined,
    });
    await assert.rejects(
      () => daily.readAccount(),
      (error: unknown) => error instanceof IpoGuruRequestError && error.vendorCode === "daily_quota_reached" && error.retryable === false,
    );
    assert.equal(dailyCalls, 1);
  });

  it("retries 5xx and then opens the circuit without another transport call", async () => {
    let calls = 0;
    const settings = readConfig(
      { IPOGURU_ENABLED: "true", IPOGURU_API_KEY: key, IPOGURU_MINUTE_BUDGET: "10", IPOGURU_DAILY_BUDGET: "20" },
      "0.1.0",
    ).ipoGuru;
    const policy = {
      ...defaultQuotaPolicy(),
      requestsPerMinute: 20,
      requestsPerDay: 20,
      reservedRequests: 0,
      maxRetries: 1,
      backoffBaseMs: 0,
      backoffMaxMs: 1_000,
      circuitFailures: 2,
      circuitOpenMs: 30_000,
    };
    const client = createIpoGuruClient({
      settings,
      quotaPolicy: policy,
      logger: createLogger({ level: "error", service: "test", sink: () => undefined }),
      transport: async () => {
        calls += 1;
        return { status: 503, headers: {}, body: "" };
      },
      now: () => new Date("2026-10-19T08:00:00.000Z"),
      sleep: async () => undefined,
    });
    await assert.rejects(() => client.readAccount(), (error: unknown) => error instanceof IpoGuruRequestError && error.httpStatus === 503);
    await assert.rejects(() => client.readAccount(), ProviderOutageError);
    assert.equal(calls, 2);
    const monitor = await client.monitor();
    assert.equal(monitor.lastFailure?.httpStatus, 503);
    assert.equal(monitor.account, null);
  });

  it("rejects an account document that echoes the API key", async () => {
    const client = createIpoGuruClient({
      settings: readConfig(
        { IPOGURU_ENABLED: "true", IPOGURU_API_KEY: key, IPOGURU_MINUTE_BUDGET: "5", IPOGURU_DAILY_BUDGET: "5" },
        "0.1.0",
      ).ipoGuru,
      quotaPolicy: { ...defaultQuotaPolicy(), reservedRequests: 0, maxRetries: 1, circuitFailures: 5 },
      logger: createLogger({ level: "error", service: "test", sink: () => undefined }),
      transport: async () => ({ status: 200, headers: headers(), body: accountPayload({ plan_label: key }) }),
      now: () => new Date("2026-10-19T08:00:00.000Z"),
      sleep: async () => undefined,
    });
    await assert.rejects(
      () => client.readAccount(),
      (error: unknown) => error instanceof IpoGuruRequestError && error.vendorCode === "malformed",
    );
    assert.equal((await client.monitor()).account, null);
  });
});

describe("IPO Guru transport", () => {
  it("times out a connection that never completes TLS and does not follow a redirect", async () => {
    const server = createNetServer((socket) => {
      socket.pause();
    });
    const port = await listen(server);
    const transport = createHttpsTransport({ rejectUnauthorized: false });
    try {
      await assert.rejects(
        () =>
          transport({
            url: `https://127.0.0.1:${port}/api/v2/me`,
            hostname: "127.0.0.1",
            headers: { accept: "application/json" },
            connectTimeoutMs: 50,
            responseTimeoutMs: 1_000,
          }),
        (error: unknown) => error instanceof IpoGuruTransportError && error.reason === "connect_timeout",
      );
      await assert.rejects(
        () =>
          transport({
            url: "http://www.ipoguru.in/api/v2/me",
            hostname: "www.ipoguru.in",
            headers: {},
            connectTimeoutMs: 50,
            responseTimeoutMs: 50,
          }),
        (error: unknown) => error instanceof IpoGuruTransportError && error.reason === "network",
      );
    } finally {
      server.close();
    }
  });

  it("times out a response body that stalls after the headers", async () => {
    const dir = mkdtempSync(`${tmpdir()}/ipo-guru-`);
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", `${dir}/key.pem`, "-out", `${dir}/cert.pem`, "-days", "1", "-nodes", "-subj", "/CN=127.0.0.1"], {
      stdio: "ignore",
    });
    const server = createTlsServer(
      { key: readFileSync(`${dir}/key.pem`), cert: readFileSync(`${dir}/cert.pem`) },
      (_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.write("{");
      },
    );
    const port = await listen(server);
    const transport = createHttpsTransport({ rejectUnauthorized: false });
    try {
      await assert.rejects(
        () =>
          transport({
            url: `https://127.0.0.1:${port}/api/v2/me`,
            hostname: "127.0.0.1",
            headers: { accept: "application/json" },
            connectTimeoutMs: 1_000,
            responseTimeoutMs: 50,
          }),
        (error: unknown) => error instanceof IpoGuruTransportError && error.reason === "response_timeout",
      );
    } finally {
      server.close();
    }
  });
});

describe("IPO Guru account route", () => {
  it("reports the account on the protected status route and hides the probe when disabled", async () => {
    const lines: string[] = [];
    const config = readConfig(
      {
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        OPS_TOKEN: "development-token-1",
        IPOGURU_ENABLED: "true",
        IPOGURU_API_KEY: key,
        IPOGURU_MINUTE_BUDGET: "5",
        IPOGURU_DAILY_BUDGET: "10",
      },
      "0.1.0",
    );
    config.port = 0;
    const client = createIpoGuruClient({
      settings: config.ipoGuru,
      quotaPolicy: { ...config.quota, reservedRequests: 0, maxRetries: 0 },
      logger: createLogger({ level: "info", service: "test", sink: (line) => lines.push(line) }),
      transport: async (request) => {
        assert.equal(request.headers["X-API-KEY"], key);
        return { status: 200, headers: headers(), body: accountPayload() };
      },
      now: () => new Date("2026-10-19T08:00:00.000Z"),
    });
    const logger = createLogger({ level: "info", service: "test", sink: (line) => lines.push(line) });
    const server = await startServer(config, logger, undefined, undefined, client);
    try {
      const hidden = await fetch(`${server.url}/internal/ipoguru/account`, { headers: { connection: "close" } });
      assert.equal(hidden.status, 404);
      await hidden.arrayBuffer();
      const opened = await fetch(`${server.url}/internal/ipoguru/account`, {
        headers: { connection: "close", "x-ops-token": "development-token-1" },
      });
      const body = (await opened.json()) as { plan: string; scopes: string[]; limits: { perDay: number }; expiresAt: string };
      assert.equal(opened.status, 200);
      assert.equal(body.plan, "standard");
      assert.equal(body.expiresAt, "2027-03-31");
      assert.equal(body.limits.perDay, 1000);
      assert.ok(body.scopes.includes("gmp"));
      const status = await fetch(`${server.url}/internal/status`, {
        headers: { connection: "close", "x-ops-token": "development-token-1" },
      });
      const monitor = (await status.json()) as { ipoGuru: { enabled: boolean; account: { plan: string } | null; vendor: { remaining: number } } };
      assert.equal(monitor.ipoGuru.enabled, true);
      assert.equal(monitor.ipoGuru.account?.plan, "standard");
      assert.equal(monitor.ipoGuru.vendor.remaining, 997);
      const health = await fetch(`${server.url}/api/v1/health`, { headers: { connection: "close" } });
      const healthBody = await health.text();
      assert.equal(healthBody.includes("ipoGuru"), false);
      assert.equal(healthBody.includes(key), false);
      assert.equal(lines.join("\n").includes(key), false);
    } finally {
      await server.shutdown();
    }
  });
});

describe("IPO Guru request path", () => {
  it("keeps documented filters and refuses a key in the query string", () => {
    assert.equal(vendorRequestPath(new URL("https://www.ipoguru.in/api/v2/ipos?months=0&limit=8")), "/api/v2/ipos?months=0&limit=8");
    assert.equal(vendorRequestPath(new URL("https://www.ipoguru.in/api/v2/me")), "/api/v2/me");
    assert.equal(vendorRequestPath(new URL("https://www.ipoguru.in/api/v2/ipos?api_key=secret")), null);
    assert.equal(vendorRequestPath(new URL("https://www.ipoguru.in/api/v2/unlisted/example?days=30")), "/api/v2/unlisted/example?days=30");
  });

  it("calls the OFS, unlisted, and anchor paths without putting the key in the URL", async () => {
    const config = readConfig(
      { IPOGURU_ENABLED: "true", IPOGURU_API_KEY: key, IPOGURU_MINUTE_BUDGET: "20", IPOGURU_DAILY_BUDGET: "100" },
      "0.1.0",
    );
    const urls: string[] = [];
    const client = createIpoGuruClient({
      settings: config.ipoGuru,
      quotaPolicy: { ...defaultQuotaPolicy(), reservedRequests: 0, maxRetries: 0 },
      logger: createLogger({ level: "error", service: "test", sink: () => undefined }),
      transport: async (request) => {
        urls.push(request.url);
        assert.equal(request.headers["X-API-KEY"], key);
        assert.equal(request.url.includes(key), false);
        const path = new URL(request.url).pathname;
        const body = path.endsWith("/ofs") || path.endsWith("/unlisted") ? { success: true, plan: "pro", data: [] } : { success: true, plan: "pro", data: { slug: "sample-ipo" } };
        return { status: 200, headers: headers(), body: JSON.stringify(body) };
      },
    });
    assert.deepEqual(await client.listOfs({ limit: 2 }), []);
    assert.deepEqual(await client.listUnlisted({ search: "sample" }), []);
    assert.deepEqual(await client.readAnchors("sample-ipo"), { slug: "sample-ipo" });
    assert.deepEqual(urls.map((url) => new URL(url).pathname + new URL(url).search), [
      "/api/v2/ofs?limit=2",
      "/api/v2/unlisted?search=sample",
      "/api/v2/ipos/sample-ipo/anchors",
    ]);
    await assert.rejects(() => client.readOfs("Not A Slug"), (error: unknown) => error instanceof IpoGuruRequestError && error.vendorCode === "malformed");
  });
});

describe("IPO Guru configuration", () => {
  it("stays disabled by default and rejects an insecure or public key", () => {
    const config = readConfig({}, "0.1.0");
    assert.equal(config.ipoGuru.enabled, false);
    assert.equal(config.ipoGuru.baseUrl, "https://www.ipoguru.in/api/v2");
    assert.equal(config.ipoGuru.apiKey, null);
    assert.equal(JSON.stringify(config).includes("apiKey"), false);
    const enabled = readConfig(
      { IPOGURU_ENABLED: "true", IPOGURU_API_KEY: key, IPOGURU_MINUTE_BUDGET: "20", IPOGURU_DAILY_BUDGET: "100" },
      "0.1.0",
    );
    assert.equal(enabled.ipoGuru.apiKey, key);
    assert.equal(JSON.stringify(enabled).includes(key), false);
    for (const env of [
      { IPOGURU_BASE_URL: "http://www.ipoguru.in/api/v2" },
      { IPOGURU_BASE_URL: "https://evil.example/api/v2" },
      { IPOGURU_BASE_URL: `https://user:${key}@www.ipoguru.in/api/v2` },
      { IPOGURU_ENABLED: "true" },
      { NEXT_PUBLIC_IPOGURU_API_KEY: key },
    ]) {
      assert.throws(
        () => readConfig(env, "0.1.0"),
        (error: unknown) => {
          assert.ok(error instanceof ConfigError);
          assert.equal(error.message.includes(key), false);
          return true;
        },
      );
    }
  });
});
