import { apiErrorSchema } from "@ipo-singh/contracts";
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
const email = "reader@example.com";

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

function cookieHeader(setCookies: readonly string[]): string {
  return setCookies.map((line) => line.split(";")[0] ?? "").join("; ");
}

function cookieValue(setCookies: readonly string[], name: string): string {
  const line = setCookies.find((item) => item.startsWith(`${name}=`));
  return decodeURIComponent((line?.split(";")[0] ?? "").slice(name.length + 1));
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

describe("password sessions", () => {
  const servers: RunningServer[] = [];
  const lines: string[] = [];
  const store = createMemoryAccountStore();

  after(async () => {
    await Promise.all(servers.map((item) => item.shutdown()));
  });

  it("registers, rejects duplicates and bad passwords, and keeps the catalogue public", async () => {
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

    const catalogue = await fetch(`${server.url}/api/v1/ipos`, { headers: { connection: "close" } });
    assert.equal(catalogue.status, 200);
    await catalogue.arrayBuffer();
    const missingAuth = await fetch(`${server.url}/api/v1/auth`, { headers: { connection: "close" } });
    assert.equal(missingAuth.status, 404);
    await missingAuth.arrayBuffer();

    const weak = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email, password: "short" }),
    });
    assert.equal(weak.status, 400);
    assert.equal(weak.headers.getSetCookie().length, 0);
    await weak.arrayBuffer();

    const created = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: " Reader@Example.com ", password, displayName: "A Reader" }),
    });
    const createdCookies = created.headers.getSetCookie();
    const createdBody = await readJson(created);
    assert.equal(created.status, 201);
    assert.equal(JSON.stringify(createdBody).includes(password), false);
    assert.equal(JSON.stringify(createdBody).includes("passwordHash"), false);
    assert.equal(JSON.stringify(createdBody).includes("accessToken"), false);
    assert.equal(JSON.stringify(createdBody).includes("refreshToken"), false);
    assert.match(createdCookies[0] ?? "", /HttpOnly/);
    assert.match(createdCookies[1] ?? "", /Path=\/api\/v1\/auth/);
    assert.equal((createdCookies[2] ?? "").includes("HttpOnly"), false);

    const duplicate = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email, password }),
    });
    const duplicateBody = apiErrorSchema.parse(await readJson(duplicate));
    assert.equal(duplicate.status, 400);
    assert.equal(duplicateBody.message.toLowerCase().includes("already"), false);
    assert.equal(duplicateBody.message.toLowerCase().includes("exists"), false);
    assert.equal(JSON.stringify(duplicateBody).includes(email), false);

    const unknown = await fetch(`${server.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: "missing@example.com", password }),
    });
    const wrong = await fetch(`${server.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email, password: "Wrong-password-1" }),
    });
    const unknownBody = apiErrorSchema.parse(await readJson(unknown));
    const wrongBody = apiErrorSchema.parse(await readJson(wrong));
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(unknownBody.message, wrongBody.message);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const limited = await fetch(`${server.url}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", connection: "close" },
        body: JSON.stringify({ email, password: "Wrong-password-1" }),
      });
      await limited.arrayBuffer();
    }
    const blocked = await fetch(`${server.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email, password }),
    });
    const blockedBody = apiErrorSchema.parse(await readJson(blocked));
    assert.equal(blocked.status, 429);
    assert.equal(blockedBody.code, "rate_limited");

    assert.equal(lines.join("\n").includes(password), false);
  });

  it("rotates refresh tokens, expires access, requires CSRF on logout, and revokes every device", async () => {
    const freshStore = createMemoryAccountStore();
    const database: DatabaseHandle = {
      async check() {
        return "ok";
      },
      async close() {
        return undefined;
      },
      accounts: freshStore,
    };
    const quiet = createLogger({ level: "error", service: "ipo-singh-api", sink: () => undefined });
    const current = await startServer(config(), quiet, database, undefined, undefined, {
      hasher: createFastPasswordHasher(),
      attempts: createLoginAttemptLimiter({ maxFailures: 20, windowMs: 60_000 }),
    });
    servers.push(current);

    const created = await fetch(`${current.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email, password }),
    });
    const createdCookies = created.headers.getSetCookie();
    const createdBody = (await readJson(created)) as { account: { id: string } };
    assert.equal(created.status, 201);

    const session = await fetch(`${current.url}/api/v1/auth/session`, {
      headers: { cookie: cookieHeader(createdCookies), connection: "close" },
    });
    assert.equal(session.status, 200);
    await session.arrayBuffer();

    const blockedLogout = await fetch(`${current.url}/api/v1/auth/logout`, {
      method: "POST",
      headers: { cookie: cookieHeader(createdCookies), connection: "close" },
    });
    assert.equal(blockedLogout.status, 403);
    await blockedLogout.arrayBuffer();

    const sessions = await freshStore.listSessionsForUser(createdBody.account.id);
    const currentSession = sessions[0];
    assert.ok(currentSession);
    await freshStore.saveSession({ ...currentSession, accessExpiresAt: new Date(Date.now() - 1_000) });
    const expiredAccess = await fetch(`${current.url}/api/v1/auth/session`, {
      headers: { cookie: cookieHeader(createdCookies), connection: "close" },
    });
    assert.equal(expiredAccess.status, 401);
    await expiredAccess.arrayBuffer();

    const refreshed = await fetch(`${current.url}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { cookie: cookieHeader(createdCookies), connection: "close" },
    });
    const refreshedCookies = refreshed.headers.getSetCookie();
    assert.equal(refreshed.status, 200);
    assert.notEqual(cookieValue(refreshedCookies, "ipo_singh_refresh"), cookieValue(createdCookies, "ipo_singh_refresh"));
    const refreshedBody = await readJson(refreshed);
    assert.equal(JSON.stringify(refreshedBody).includes("accessToken"), false);
    assert.equal(JSON.stringify(refreshedBody).includes("refreshToken"), false);

    const reused = await fetch(`${current.url}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { cookie: `ipo_singh_refresh=${cookieValue(createdCookies, "ipo_singh_refresh")}`, connection: "close" },
    });
    assert.equal(reused.status, 401);
    await reused.arrayBuffer();

    const second = await fetch(`${current.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email, password }),
    });
    const secondCookies = second.headers.getSetCookie();
    assert.equal(second.status, 200);
    await second.arrayBuffer();
    const third = await fetch(`${current.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email, password }),
    });
    const thirdCookies = third.headers.getSetCookie();
    assert.equal(third.status, 200);
    await third.arrayBuffer();

    const loggedOut = await fetch(`${current.url}/api/v1/auth/logout-all`, {
      method: "POST",
      headers: {
        cookie: cookieHeader(thirdCookies),
        "x-csrf-token": cookieValue(thirdCookies, "ipo_singh_csrf"),
        connection: "close",
      },
    });
    assert.equal(loggedOut.status, 204);
    await loggedOut.arrayBuffer();
    const after = await fetch(`${current.url}/api/v1/auth/session`, {
      headers: { cookie: cookieHeader(secondCookies), connection: "close" },
    });
    assert.equal(after.status, 401);
    await after.arrayBuffer();

    const signedIn = await fetch(`${current.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email, password }),
    });
    const signedInCookies = signedIn.headers.getSetCookie();
    const signedInBody = (await readJson(signedIn)) as { account: { id: string } };
    const live = await freshStore.listSessionsForUser(signedInBody.account.id);
    const liveSession = live.find((item) => item.revokedAt === null);
    assert.ok(liveSession);
    await freshStore.saveSession({ ...liveSession, refreshExpiresAt: new Date(Date.now() - 1_000) });
    const expiredRefresh = await fetch(`${current.url}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { cookie: cookieHeader(signedInCookies), connection: "close" },
    });
    assert.equal(expiredRefresh.status, 401);
    await expiredRefresh.arrayBuffer();
    const stored = await freshStore.findSessionById(liveSession.id);
    assert.equal(stored?.revokeReason, "expired");
  });

  it("closes an account with password confirmation and refuses a wrong password", async () => {
    const deleteStore = createMemoryAccountStore();
    const database: DatabaseHandle = {
      async check() {
        return "ok";
      },
      async close() {
        return undefined;
      },
      accounts: deleteStore,
    };
    const quiet = createLogger({ level: "error", service: "ipo-singh-api", sink: () => undefined });
    const current = await startServer(config(), quiet, database, undefined, undefined, {
      hasher: createFastPasswordHasher(),
      attempts: createLoginAttemptLimiter({ maxFailures: 20, windowMs: 60_000 }),
    });
    servers.push(current);

    const deleteEmail = "close-me@example.com";
    const created = await fetch(`${current.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: deleteEmail, password }),
    });
    const cookies = created.headers.getSetCookie();
    const body = (await readJson(created)) as { account: { id: string } };
    assert.equal(created.status, 201);

    const wrong = await fetch(`${current.url}/api/v1/auth/account/delete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader(cookies),
        "x-csrf-token": cookieValue(cookies, "ipo_singh_csrf"),
        connection: "close",
      },
      body: JSON.stringify({ password: "Wrong-password-1", confirmation: "DELETE" }),
    });
    assert.equal(wrong.status, 401);
    await wrong.arrayBuffer();

    const closed = await fetch(`${current.url}/api/v1/auth/account/delete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader(cookies),
        "x-csrf-token": cookieValue(cookies, "ipo_singh_csrf"),
        connection: "close",
      },
      body: JSON.stringify({ password, confirmation: "DELETE" }),
    });
    assert.equal(closed.status, 204);
    await closed.arrayBuffer();

    const user = await deleteStore.findUser(body.account.id);
    assert.equal(user?.status, "closed");
    const sessions = await deleteStore.listSessionsForUser(body.account.id);
    assert.equal(sessions.every((item) => item.revokedAt !== null), true);

    const loginAgain = await fetch(`${current.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: deleteEmail, password }),
    });
    assert.equal(loginAgain.status, 401);
    await loginAgain.arrayBuffer();
  });
});
