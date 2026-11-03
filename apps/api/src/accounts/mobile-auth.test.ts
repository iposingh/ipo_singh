import { mobileSessionGrantSchema } from "@ipo-singh/contracts";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createLoginAttemptLimiter } from "./attempts.ts";
import { createMemoryAccountStore } from "./memory-store.ts";
import { createFastPasswordHasher } from "./passwords.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import type { AppConfig } from "../config/env.ts";
import { defaultHttpLimits } from "../config/http-limits.ts";
import { disabledIpoGuruConfig } from "../config/ipoguru.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import { startServer, type RunningServer } from "../index.ts";
import { createLogger } from "../shared/logger.ts";

const password = "Horse-battery-99";
const email = "phone@example.com";

function config(): AppConfig {
  const http = defaultHttpLimits();
  return {
    nodeEnv: "test",
    deployment: "test",
    host: "127.0.0.1",
    port: 0,
    corsOrigins: ["http://localhost:3000"],
    logLevel: "info",
    requestBodyLimit: "100kb",
    shutdownTimeoutMs: 1000,
    ...http,
    rateLimit: { ...http.rateLimit, authPerWindow: 100 },
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
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

describe("native session transport", () => {
  const servers: RunningServer[] = [];
  const lines: string[] = [];

  after(async () => {
    await Promise.all(servers.map((item) => item.shutdown()));
  });

  it("returns the same secrets to iOS, rotates them, and keeps them out of web JSON", async () => {
    const store = createMemoryAccountStore();
    const logger = createLogger({ level: "info", service: "ipo-singh-api", sink: (line) => lines.push(line) });
    const database: DatabaseHandle = {
      async check() {
        return "ok";
      },
      async close() {
        return undefined;
      },
      accounts: store,
    };
    const server = await startServer(config(), logger, database, undefined, undefined, {
      hasher: createFastPasswordHasher(),
      attempts: createLoginAttemptLimiter({ maxFailures: 5, windowMs: 60_000 }),
    });
    servers.push(server);

    const web = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: "web@example.com", password }),
    });
    const webBody = await readJson(web);
    assert.equal(web.status, 201);
    assert.equal(JSON.stringify(webBody).includes("accessToken"), false);
    assert.match(web.headers.getSetCookie()[0] ?? "", /HttpOnly/);

    const created = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ipo-singh-client": "ios", connection: "close" },
      body: JSON.stringify({ email, password, displayName: "Phone Reader" }),
    });
    const grant = mobileSessionGrantSchema.parse(await readJson(created));
    assert.equal(created.status, 201);
    assert.equal(JSON.stringify(grant).includes(password), false);
    assert.equal(JSON.stringify(grant).includes("csrf"), false);
    const devices = await store.listDevicesForUser(grant.account.id);
    assert.equal(devices.some((device) => device.client === "ios"), true);

    const session = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { authorization: `Bearer ${grant.accessToken}`, connection: "close" },
    });
    const sessionBody = (await readJson(session)) as { sessions: { client: string; current: boolean; id: string }[] };
    assert.equal(session.status, 200);
    assert.equal(sessionBody.sessions.some((item) => item.current && item.client === "ios"), true);

    const refreshed = await fetch(`${server.url}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ipo-singh-client": "ios", connection: "close" },
      body: JSON.stringify({ refreshToken: grant.refreshToken }),
    });
    const rotated = mobileSessionGrantSchema.parse(await readJson(refreshed));
    assert.equal(refreshed.status, 200);
    assert.notEqual(rotated.refreshToken, grant.refreshToken);
    assert.notEqual(rotated.accessToken, grant.accessToken);

    const oldAccess = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { authorization: `Bearer ${grant.accessToken}`, connection: "close" },
    });
    assert.equal(oldAccess.status, 401);
    await oldAccess.arrayBuffer();

    const bodyOnly = await fetch(`${server.url}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ refreshToken: rotated.refreshToken }),
    });
    assert.equal(bodyOnly.status, 401);
    await bodyOnly.arrayBuffer();

    const stillCurrent = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { authorization: `Bearer ${rotated.accessToken}`, connection: "close" },
    });
    assert.equal(stillCurrent.status, 200);
    await stillCurrent.arrayBuffer();

    const reused = await fetch(`${server.url}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ipo-singh-client": "ios", connection: "close" },
      body: JSON.stringify({ refreshToken: grant.refreshToken }),
    });
    assert.equal(reused.status, 401);
    await reused.arrayBuffer();
    const sessions = await store.listSessionsForUser(grant.account.id);
    assert.equal(sessions.some((item) => item.revokeReason === "rotation_reuse"), true);

    const next = await fetch(`${server.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ipo-singh-client": "android", connection: "close" },
      body: JSON.stringify({ email, password }),
    });
    const android = mobileSessionGrantSchema.parse(await readJson(next));
    assert.equal(next.status, 200);
    const second = await fetch(`${server.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ipo-singh-client": "ios", connection: "close" },
      body: JSON.stringify({ email, password }),
    });
    const other = mobileSessionGrantSchema.parse(await readJson(second));
    const changed = await fetch(`${server.url}/api/v1/auth/password`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${android.accessToken}`, connection: "close" },
      body: JSON.stringify({ currentPassword: password, newPassword: "Horse-battery-98" }),
    });
    assert.equal(changed.status, 200);
    await changed.arrayBuffer();
    const otherSession = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { authorization: `Bearer ${other.accessToken}`, connection: "close" },
    });
    assert.equal(otherSession.status, 401);
    await otherSession.arrayBuffer();
    const currentSession = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { authorization: `Bearer ${android.accessToken}`, connection: "close" },
    });
    assert.equal(currentSession.status, 200);
    await currentSession.arrayBuffer();
    const loggedOut = await fetch(`${server.url}/api/v1/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${android.accessToken}`, connection: "close" },
    });
    assert.equal(loggedOut.status, 204);
    await loggedOut.arrayBuffer();
    const after = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { authorization: `Bearer ${android.accessToken}`, connection: "close" },
    });
    assert.equal(after.status, 401);
    await after.arrayBuffer();

    const joined = lines.join("\n");
    assert.equal(joined.includes(password), false);
    assert.equal(joined.includes(grant.accessToken), false);
    assert.equal(joined.includes(grant.refreshToken), false);
    assert.equal(joined.includes(rotated.accessToken), false);
    assert.equal(joined.includes(android.refreshToken), false);
  });

  it("reuses one iOS device for the same installation id on login", async () => {
    const store = createMemoryAccountStore();
    const logger = createLogger({ level: "info", service: "ipo-singh-api", sink: () => undefined });
    const database: DatabaseHandle = {
      async check() {
        return "ok";
      },
      async close() {
        return undefined;
      },
      accounts: store,
    };
    const server = await startServer(config(), logger, database, undefined, undefined, {
      hasher: createFastPasswordHasher(),
      attempts: createLoginAttemptLimiter({ maxFailures: 5, windowMs: 60_000 }),
    });
    servers.push(server);
    const installationId = "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e91";
    const created = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ipo-singh-client": "ios", connection: "close" },
      body: JSON.stringify({ email: "install@example.com", password, installationId }),
    });
    const first = mobileSessionGrantSchema.parse(await readJson(created));
    assert.equal(created.status, 201);
    const again = await fetch(`${server.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ipo-singh-client": "ios", connection: "close" },
      body: JSON.stringify({ email: "install@example.com", password, installationId }),
    });
    const second = mobileSessionGrantSchema.parse(await readJson(again));
    assert.equal(again.status, 200);
    const devices = (await store.listDevicesForUser(first.account.id)).filter((device) => !device.revokedAt && device.client === "ios");
    assert.equal(devices.length, 1);
    assert.equal(devices[0]?.installationId, installationId);
    const stale = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { authorization: `Bearer ${first.accessToken}`, connection: "close" },
    });
    assert.equal(stale.status, 401);
    await stale.arrayBuffer();
    const live = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { authorization: `Bearer ${second.accessToken}`, connection: "close" },
    });
    assert.equal(live.status, 200);
    await live.arrayBuffer();
  });
});
