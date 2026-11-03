import { apiErrorSchema, publicAccountSchema } from "@ipo-singh/contracts";
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

function config(): AppConfig {
  const http = defaultHttpLimits();
  return {
    nodeEnv: "test",
    deployment: "test",
    host: "127.0.0.1",
    port: 0,
    corsOrigins: ["http://localhost:3000"],
    logLevel: "error",
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

function authHeaders(setCookies: readonly string[]): Headers {
  return new Headers({
    cookie: cookieHeader(setCookies),
    "content-type": "application/json",
    "x-csrf-token": cookieValue(setCookies, "ipo_singh_csrf"),
    connection: "close",
  });
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

describe("profile and preferences", () => {
  const servers: RunningServer[] = [];

  after(async () => {
    await Promise.all(servers.map((item) => item.shutdown()));
  });

  it("updates only the signed-in account and keeps the catalogue public", async () => {
    const database: DatabaseHandle = {
      async check() {
        return "ok";
      },
      async close() {
        return undefined;
      },
      accounts: createMemoryAccountStore(),
    };
    const server = await startServer(
      config(),
      createLogger({ level: "error", service: "ipo-singh-api", sink: () => undefined }),
      database,
      undefined,
      undefined,
      { hasher: createFastPasswordHasher(), attempts: createLoginAttemptLimiter({ maxFailures: 20, windowMs: 60_000 }) },
    );
    servers.push(server);

    const open = await fetch(`${server.url}/api/v1/ipos`, { headers: { connection: "close" } });
    assert.equal(open.status, 200);
    await open.arrayBuffer();
    const missing = await fetch(`${server.url}/api/v1/auth`, { headers: { connection: "close" } });
    assert.equal(missing.status, 404);
    await missing.arrayBuffer();

    const anonymous = await fetch(`${server.url}/api/v1/auth/profile`, {
      method: "PATCH",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ displayName: "Guest" }),
    });
    assert.equal(anonymous.status, 401);
    await anonymous.arrayBuffer();

    const first = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: "owner@example.com", password, displayName: "Owner" }),
    });
    const firstCookies = first.headers.getSetCookie();
    assert.equal(first.status, 201);
    await first.arrayBuffer();

    const secondLogin = await fetch(`${server.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: "owner@example.com", password }),
    });
    const secondCookies = secondLogin.headers.getSetCookie();
    assert.equal(secondLogin.status, 200);
    await secondLogin.arrayBuffer();

    const other = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: "other@example.com", password, displayName: "Other" }),
    });
    const otherCookies = other.headers.getSetCookie();
    assert.equal(other.status, 201);
    await other.arrayBuffer();

    const ownerSession = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { cookie: cookieHeader(secondCookies), connection: "close" },
    });
    const ownerBody = (await readJson(ownerSession)) as { sessions: { id: string; current: boolean }[] };
    const currentId = ownerBody.sessions.find((item) => item.current)?.id;
    const otherId = ownerBody.sessions.find((item) => !item.current)?.id;
    assert.ok(currentId);
    assert.ok(otherId);

    const renamed = await fetch(`${server.url}/api/v1/auth/profile`, {
      method: "PATCH",
      headers: authHeaders(secondCookies),
      body: JSON.stringify({ displayName: "Updated Owner", userId: "someone-else", passwordHash: "hidden" }),
    });
    assert.equal(renamed.status, 400);
    await renamed.arrayBuffer();

    const blank = await fetch(`${server.url}/api/v1/auth/profile`, {
      method: "PATCH",
      headers: authHeaders(secondCookies),
      body: JSON.stringify({ displayName: "   " }),
    });
    const blankAccount = publicAccountSchema.parse((await readJson(blank) as { account: unknown }).account);
    assert.equal(blank.status, 200);
    assert.equal(blankAccount.displayName, null);
    assert.equal(JSON.stringify(blankAccount).includes("passwordHash"), false);

    const named = await fetch(`${server.url}/api/v1/auth/profile`, {
      method: "PATCH",
      headers: authHeaders(secondCookies),
      body: JSON.stringify({ displayName: "Updated Owner" }),
    });
    const namedAccount = publicAccountSchema.parse((await readJson(named) as { account: unknown }).account);
    assert.equal(named.status, 200);
    assert.equal(namedAccount.displayName, "Updated Owner");

    const badPreference = await fetch(`${server.url}/api/v1/auth/preferences`, {
      method: "PATCH",
      headers: authHeaders(secondCookies),
      body: JSON.stringify({ colorScheme: "blue", email: "changed@example.com" }),
    });
    assert.equal(badPreference.status, 400);
    await badPreference.arrayBuffer();

    const saved = await fetch(`${server.url}/api/v1/auth/preferences`, {
      method: "PATCH",
      headers: authHeaders(secondCookies),
      body: JSON.stringify({
        colorScheme: "dark",
        defaultBoard: "sme",
        alertsEnabled: true,
        notificationCategories: { gmp: true },
        watchlistDisplay: { density: "compact" },
        mobilePush: "when-available",
      }),
    });
    const savedAccount = publicAccountSchema.parse((await readJson(saved) as { account: unknown }).account);
    assert.equal(saved.status, 200);
    assert.equal(savedAccount.preferences.colorScheme, "dark");
    assert.equal(savedAccount.preferences.defaultBoard, "sme");
    assert.equal(savedAccount.preferences.alertsEnabled, true);
    assert.equal(savedAccount.preferences.notificationCategories.gmp, true);
    assert.equal(savedAccount.preferences.notificationCategories.open, false);
    assert.equal(savedAccount.preferences.watchlistDisplay.density, "compact");
    assert.equal(savedAccount.preferences.watchlistDisplay.showGmp, true);
    assert.equal(savedAccount.preferences.mobilePush, "when-available");
    assert.equal(savedAccount.preferences.timeZone, "Asia/Kolkata");
    assert.equal(savedAccount.email, "owner@example.com");

    const again = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { cookie: cookieHeader(secondCookies), connection: "close" },
    });
    const againAccount = publicAccountSchema.parse((await readJson(again) as { account: unknown }).account);
    assert.equal(againAccount.preferences.defaultBoard, "sme");
    assert.equal(againAccount.displayName, "Updated Owner");

    const currentRevoke = await fetch(`${server.url}/api/v1/auth/sessions/revoke`, {
      method: "POST",
      headers: authHeaders(secondCookies),
      body: JSON.stringify({ sessionId: currentId }),
    });
    const currentRevokeBody = apiErrorSchema.parse(await readJson(currentRevoke));
    assert.equal(currentRevoke.status, 400);
    assert.match(currentRevokeBody.fieldErrors?.[0]?.message ?? "", /Sign out/);

    const foreign = await fetch(`${server.url}/api/v1/auth/sessions/revoke`, {
      method: "POST",
      headers: authHeaders(otherCookies),
      body: JSON.stringify({ sessionId: otherId }),
    });
    assert.equal(foreign.status, 404);
    const foreignText = JSON.stringify(await readJson(foreign));
    assert.equal(foreignText.includes("owner@example.com"), false);
    assert.equal(foreignText.includes("passwordHash"), false);

    const revoked = await fetch(`${server.url}/api/v1/auth/sessions/revoke`, {
      method: "POST",
      headers: authHeaders(secondCookies),
      body: JSON.stringify({ sessionId: otherId }),
    });
    const revokedBody = (await readJson(revoked)) as { sessions: { id: string; revokedAt: string | null }[] };
    assert.equal(revoked.status, 200);
    assert.equal(revokedBody.sessions.find((item) => item.id === otherId)?.revokedAt === null, false);
    assert.equal(JSON.stringify(revokedBody).includes("accessTokenHash"), false);

    const ended = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { cookie: cookieHeader(firstCookies), connection: "close" },
    });
    assert.equal(ended.status, 401);
    await ended.arrayBuffer();

    const wrongPassword = await fetch(`${server.url}/api/v1/auth/password`, {
      method: "POST",
      headers: authHeaders(secondCookies),
      body: JSON.stringify({ currentPassword: "Wrong-password-1", newPassword: "Fresh-password-99" }),
    });
    assert.equal(wrongPassword.status, 401);
    await wrongPassword.arrayBuffer();

    const weakPassword = await fetch(`${server.url}/api/v1/auth/password`, {
      method: "POST",
      headers: authHeaders(secondCookies),
      body: JSON.stringify({ currentPassword: password, newPassword: "short" }),
    });
    assert.equal(weakPassword.status, 400);
    await weakPassword.arrayBuffer();

    const extraLogin = await fetch(`${server.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: "owner@example.com", password }),
    });
    const extraCookies = extraLogin.headers.getSetCookie();
    assert.equal(extraLogin.status, 200);
    await extraLogin.arrayBuffer();

    const changed = await fetch(`${server.url}/api/v1/auth/password`, {
      method: "POST",
      headers: authHeaders(secondCookies),
      body: JSON.stringify({ currentPassword: password, newPassword: "Fresh-password-99" }),
    });
    const changedAccount = publicAccountSchema.parse((await readJson(changed) as { account: unknown }).account);
    assert.equal(changed.status, 200);
    assert.equal(JSON.stringify(changedAccount).includes("passwordHash"), false);
    assert.equal(JSON.stringify(changedAccount).includes("Fresh-password-99"), false);

    const stillHere = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { cookie: cookieHeader(secondCookies), connection: "close" },
    });
    assert.equal(stillHere.status, 200);
    await stillHere.arrayBuffer();

    const signedOut = await fetch(`${server.url}/api/v1/auth/session`, {
      headers: { cookie: cookieHeader(extraCookies), connection: "close" },
    });
    assert.equal(signedOut.status, 401);
    await signedOut.arrayBuffer();
  });
});
