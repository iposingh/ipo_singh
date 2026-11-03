import { accountSessionResponseSchema, adminAccountResponseSchema, adminAuditListSchema, adminProviderStatusSchema, adminRevokeResultSchema, apiErrorSchema, defaultAccountPreferences } from "@ipo-singh/contracts";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import type { AppConfig } from "../config/env.ts";
import { defaultHttpLimits } from "../config/http-limits.ts";
import { disabledIpoGuruConfig } from "../config/ipoguru.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import { startServer, type RunningServer } from "../index.ts";
import { ConfigError } from "../shared/errors.ts";
import { createLogger } from "../shared/logger.ts";
import { createMemoryAdminAuditStore } from "./audit.ts";
import { createLoginAttemptLimiter } from "./attempts.ts";
import { bootstrapAdminEmailEnv, bootstrapAdminPasswordEnv, bootstrapSuperAdmin, readBootstrapAdmin } from "./bootstrap.ts";
import { createMemoryAccountStore } from "./memory-store.ts";
import { createFastPasswordHasher } from "./passwords.ts";
import { redactedProviderStatus } from "./provider-view.ts";
import type { UserRecord } from "./records.ts";
import { createAccountId } from "./tokens.ts";

const password = "Horse-battery-99";
const opsSecret = "ops-secret-value";

function config(overrides: Partial<AppConfig> = {}): AppConfig {
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
    rateLimit: { ...http.rateLimit, authPerWindow: 100, adminPerWindow: 100 },
    trustProxy: false,
    serviceName: "ipo-singh-api",
    version: "0.1.0",
    mongodb: null,
    redis: null,
    cache: defaultCachePolicy(),
    quota: defaultQuotaPolicy(),
    provider: { primary: "mock", fallback: null, timeoutMs: 8_000 },
    ipoGuru: disabledIpoGuruConfig(),
    internalServiceToken: null,
    opsToken: opsSecret,
    ...overrides,
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

function quiet() {
  return createLogger({ level: "error", service: "ipo-singh-api", sink: () => undefined });
}

function accounts() {
  return {
    hasher: createFastPasswordHasher(),
    attempts: createLoginAttemptLimiter({ maxFailures: 20, windowMs: 60_000 }),
  };
}

describe("administrator access", () => {
  const servers: RunningServer[] = [];

  after(async () => {
    await Promise.all(servers.map((item) => item.shutdown()));
  });

  it("blocks escalation, revoked sessions, and credential leaks, and writes an audit", async () => {
    const store = createMemoryAccountStore();
    const audit = createMemoryAdminAuditStore();
    const database: DatabaseHandle = {
      async check() {
        return "ok";
      },
      async close() {
        return undefined;
      },
      accounts: store,
      adminAudit: audit,
    };
    const server = await startServer(config(), quiet(), database, undefined, undefined, accounts());
    servers.push(server);

    const open = await fetch(`${server.url}/api/v1/ipos`, { headers: { connection: "close" } });
    assert.equal(open.status, 200);
    await open.arrayBuffer();
    const missingAuth = await fetch(`${server.url}/api/v1/auth`, { headers: { connection: "close" } });
    assert.equal(missingAuth.status, 404);
    await missingAuth.arrayBuffer();
    const internal = await fetch(`${server.url}/internal/status`, { headers: { connection: "close" } });
    assert.equal(internal.status, 404);
    await internal.arrayBuffer();

    const escalated = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: "member@example.com", password, role: "super-admin" }),
    });
    assert.equal(escalated.status, 400);
    await escalated.arrayBuffer();

    async function register(email: string): Promise<string[]> {
      const response = await fetch(`${server.url}/api/v1/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json", connection: "close" },
        body: JSON.stringify({ email, password, displayName: "Reader" }),
      });
      assert.equal(response.status, 201);
      const cookies = response.headers.getSetCookie();
      await response.arrayBuffer();
      return cookies;
    }

    const memberCookies = await register("member@example.com");
    const staffCookies = await register("staff@example.com");
    const rootCookies = await register("root@example.com");

    const profile = await fetch(`${server.url}/api/v1/auth/profile`, {
      method: "PATCH",
      headers: authHeaders(memberCookies),
      body: JSON.stringify({ displayName: "Member", role: "admin" }),
    });
    assert.equal(profile.status, 400);
    await profile.arrayBuffer();
    const memberSession = accountSessionResponseSchema.parse(await readJson(await fetch(`${server.url}/api/v1/auth/session`, { headers: authHeaders(memberCookies) })));
    assert.equal(memberSession.account.role, "member");

    const anonymous = await fetch(`${server.url}/api/v1/admin/session`, { headers: { connection: "close" } });
    assert.equal(anonymous.status, 401);
    await anonymous.arrayBuffer();
    const memberAdmin = await fetch(`${server.url}/api/v1/admin/session`, { headers: authHeaders(memberCookies) });
    assert.equal(memberAdmin.status, 403);
    await memberAdmin.arrayBuffer();
    const createAdmin = await fetch(`${server.url}/api/v1/admin/users`, {
      method: "POST",
      headers: authHeaders(memberCookies),
      body: JSON.stringify({ email: "new@example.com", password, role: "admin" }),
    });
    assert.equal(createAdmin.status, 404);
    await createAdmin.arrayBuffer();

    const root = await store.findUserByEmail("root@example.com");
    const staff = await store.findUserByEmail("staff@example.com");
    assert.ok(root && staff);
    await store.saveUser({ ...root, role: "super-admin" });

    const lastSuper = await fetch(`${server.url}/api/v1/admin/roles`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ userId: root.id, role: "admin", currentPassword: password }),
    });
    assert.equal(lastSuper.status, 403);
    assert.match(apiErrorSchema.parse(await readJson(lastSuper)).message, /super admin/);
    assert.equal((await store.findUser(root.id))?.role, "super-admin");

    const promoted = adminAccountResponseSchema.parse(await readJson(await fetch(`${server.url}/api/v1/admin/roles`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ userId: staff.id, role: "admin", currentPassword: password }),
    })));
    assert.equal(promoted.account.role, "admin");
    assert.equal("passwordHash" in promoted.account, false);

    const staffSession = adminAccountResponseSchema.parse(await readJson(await fetch(`${server.url}/api/v1/admin/session`, { headers: authHeaders(staffCookies) })));
    assert.equal(staffSession.account.role, "admin");
    const staffRoles = await fetch(`${server.url}/api/v1/admin/roles`, {
      method: "POST",
      headers: authHeaders(staffCookies),
      body: JSON.stringify({ userId: memberSession.account.id, role: "admin", currentPassword: password }),
    });
    assert.equal(staffRoles.status, 403);
    await staffRoles.arrayBuffer();
    const staffAudit = await fetch(`${server.url}/api/v1/admin/audit`, { headers: authHeaders(staffCookies) });
    assert.equal(staffAudit.status, 403);
    await staffAudit.arrayBuffer();
    const staffProvider = await fetch(`${server.url}/api/v1/admin/provider`, { headers: authHeaders(staffCookies) });
    assert.equal(staffProvider.status, 403);
    await staffProvider.arrayBuffer();

    const wrongPassword = await fetch(`${server.url}/api/v1/admin/roles`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ userId: staff.id, role: "member", currentPassword: "Wrong-password-99" }),
    });
    assert.equal(wrongPassword.status, 403);
    await wrongPassword.arrayBuffer();
    assert.equal((await store.findUser(staff.id))?.role, "admin");

    const secondSuper = adminAccountResponseSchema.parse(await readJson(await fetch(`${server.url}/api/v1/admin/roles`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ userId: staff.id, role: "super-admin", currentPassword: password }),
    })));
    assert.equal(secondSuper.account.role, "super-admin");
    const ownRole = await fetch(`${server.url}/api/v1/admin/roles`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ userId: root.id, role: "admin", currentPassword: password }),
    });
    assert.equal(ownRole.status, 403);
    assert.match(apiErrorSchema.parse(await readJson(ownRole)).message, /own role/);
    const demoted = adminAccountResponseSchema.parse(await readJson(await fetch(`${server.url}/api/v1/admin/roles`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ userId: staff.id, role: "admin", currentPassword: password }),
    })));
    assert.equal(demoted.account.role, "admin");

    const provider = adminProviderStatusSchema.parse(await readJson(await fetch(`${server.url}/api/v1/admin/provider`, { headers: authHeaders(rootCookies) })));
    assert.equal(provider.provider, "mock");
    assert.equal(provider.ipoGuruEnabled, false);
    assert.equal(provider.credentialConfigured, false);
    assert.equal(JSON.stringify(provider).includes(opsSecret), false);
    assert.equal(JSON.stringify(provider).includes("apiKey"), false);

    const revoked = adminRevokeResultSchema.parse(await readJson(await fetch(`${server.url}/api/v1/admin/sessions/revoke`, {
      method: "POST",
      headers: authHeaders(rootCookies),
      body: JSON.stringify({ userId: staff.id, currentPassword: password }),
    })));
    assert.equal(revoked.revoked, true);
    const revokedSession = await fetch(`${server.url}/api/v1/admin/session`, { headers: authHeaders(staffCookies) });
    assert.equal(revokedSession.status, 401);
    await revokedSession.arrayBuffer();

    const auditBody = adminAuditListSchema.parse(await readJson(await fetch(`${server.url}/api/v1/admin/audit`, { headers: authHeaders(rootCookies) })));
    const serialized = JSON.stringify(auditBody);
    assert.equal(serialized.includes(password), false);
    assert.equal(serialized.includes(opsSecret), false);
    assert.equal(auditBody.events.some((event) => event.action === "role_change" && event.outcome === "succeeded" && event.targetUserId === staff.id), true);
    assert.equal(auditBody.events.some((event) => event.action === "role_change" && event.outcome === "denied"), true);
    assert.equal(auditBody.events.some((event) => event.action === "access_denied" && event.outcome === "denied"), true);
    assert.equal(auditBody.events.some((event) => event.action === "session_revoke" && event.outcome === "succeeded" && event.targetUserId === staff.id), true);
    assert.equal(auditBody.events.some((event) => event.action === "provider_read" && event.outcome === "succeeded"), true);
    assert.equal((await store.findUser(memberSession.account.id))?.role, "member");
  });

  it("limits administrator routes separately from the catalogue", async () => {
    const database: DatabaseHandle = {
      async check() {
        return "ok";
      },
      async close() {
        return undefined;
      },
      accounts: createMemoryAccountStore(),
      adminAudit: createMemoryAdminAuditStore(),
    };
    const server = await startServer(
      config({ rateLimit: { windowMs: 60_000, cataloguePerWindow: 20, searchPerWindow: 5, detailPerWindow: 5, authPerWindow: 20, adminPerWindow: 2 } }),
      quiet(),
      database,
      undefined,
      undefined,
      accounts(),
    );
    servers.push(server);
    const headers = { connection: "close" };
    const first = await fetch(`${server.url}/api/v1/admin/session`, { headers });
    const second = await fetch(`${server.url}/api/v1/admin/session`, { headers });
    const third = await fetch(`${server.url}/api/v1/admin/session`, { headers });
    assert.equal(first.status, 401);
    assert.equal(second.status, 401);
    assert.equal(third.status, 429);
    await first.arrayBuffer();
    await second.arrayBuffer();
    await third.arrayBuffer();
    const catalogue = await fetch(`${server.url}/api/v1/ipos`, { headers });
    assert.equal(catalogue.status, 200);
    await catalogue.arrayBuffer();
  });

  it("bootstraps one super admin from the environment and never logs the password", async () => {
    const hasher = createFastPasswordHasher();
    const lines: string[] = [];
    const logger = createLogger({
      level: "info",
      service: "ipo-singh-api",
      sink: (line) => {
        lines.push(line);
      },
    });
    assert.equal(readBootstrapAdmin({}), null);
    assert.throws(() => readBootstrapAdmin({ [bootstrapAdminEmailEnv]: "boot@example.com" }), (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.message.includes("boot@example.com"), false);
      return true;
    });
    assert.throws(() => readBootstrapAdmin({ [bootstrapAdminPasswordEnv]: "short-1", [bootstrapAdminEmailEnv]: "boot@example.com" }), (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.message, `Invalid environment: ${bootstrapAdminPasswordEnv}`);
      assert.equal(error.message.includes("short-1"), false);
      return true;
    });

    const occupied = createMemoryAccountStore();
    const member = sampleUser({ email: "taken@example.com", role: "member" });
    await occupied.insertUser(member);
    const skipped = await bootstrapSuperAdmin({
      store: occupied,
      hasher,
      env: { [bootstrapAdminEmailEnv]: "taken@example.com", [bootstrapAdminPasswordEnv]: password },
      logger,
    });
    assert.equal(skipped, "skipped");
    assert.equal((await occupied.findUser(member.id))?.role, "member");
    assert.equal(lines.join("\n").includes(password), false);
    assert.equal(lines.join("\n").includes("taken@example.com"), false);

    const fresh = createMemoryAccountStore();
    const audit = createMemoryAdminAuditStore();
    const created = await bootstrapSuperAdmin({
      store: fresh,
      audit,
      hasher,
      env: { [bootstrapAdminEmailEnv]: "boot@example.com", [bootstrapAdminPasswordEnv]: password },
      logger,
    });
    assert.equal(created, "created");
    const superAdmin = await fresh.findUserByEmail("boot@example.com");
    assert.equal(superAdmin?.role, "super-admin");
    assert.equal(await hasher.verify(password, superAdmin?.passwordHash ?? ""), true);
    const again = await bootstrapSuperAdmin({
      store: fresh,
      audit,
      hasher,
      env: { [bootstrapAdminEmailEnv]: "boot@example.com", [bootstrapAdminPasswordEnv]: "Different-password-99" },
      logger,
    });
    assert.equal(again, "present");
    assert.equal((await fresh.findUserByEmail("boot@example.com"))?.passwordHash, superAdmin?.passwordHash);
    assert.equal(lines.join("\n").includes(password), false);
    assert.equal(lines.join("\n").includes("Different-password-99"), false);
    const events = await audit.listRecent(10);
    assert.equal(events.some((event) => event.action === "bootstrap" && event.outcome === "succeeded"), true);

    const view = redactedProviderStatus({
      ...config(),
      provider: { primary: "ipo-guru", fallback: null, timeoutMs: 8_000 },
      ipoGuru: {
        enabled: true,
        baseUrl: "https://www.ipoguru.in/api/v2",
        hostname: "www.ipoguru.in",
        minuteBudget: 30,
        dailyBudget: 1000,
        connectTimeoutMs: 5_000,
        responseTimeoutMs: 8_000,
        display: true,
        apiKey: "secret-key-value",
      },
    });
    assert.equal(view.credentialConfigured, true);
    assert.equal(view.minuteBudget, 30);
    assert.equal(view.dailyBudget, 1000);
    assert.equal(view.account, null);
    assert.equal(JSON.stringify(view).includes("secret-key-value"), false);
    assert.equal(JSON.stringify(view).includes(opsSecret), false);
  });

  it("creates the super admin when the API process starts with bootstrap variables", async () => {
    const lines: string[] = [];
    const store = createMemoryAccountStore();
    const database: DatabaseHandle = {
      async check() {
        return "ok";
      },
      async close() {
        return undefined;
      },
      accounts: store,
      adminAudit: createMemoryAdminAuditStore(),
    };
    const server = await startServer(
      config(),
      createLogger({
        level: "info",
        service: "ipo-singh-api",
        sink: (line) => {
          lines.push(line);
        },
      }),
      database,
      undefined,
      undefined,
      accounts(),
      { [bootstrapAdminEmailEnv]: "startup@example.com", [bootstrapAdminPasswordEnv]: password },
    );
    servers.push(server);
    const user = await store.findUserByEmail("startup@example.com");
    assert.equal(user?.role, "super-admin");
    assert.equal(lines.join("\n").includes(password), false);
    assert.equal(lines.join("\n").includes("startup@example.com"), false);
  });
});

function sampleUser(patch: Pick<UserRecord, "email" | "role">): UserRecord {
  const now = new Date("2026-10-24T00:00:00.000Z");
  return {
    id: createAccountId(),
    email: patch.email,
    displayName: null,
    status: "active",
    role: patch.role,
    preferences: defaultAccountPreferences,
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    lastAuthenticatedAt: null,
    suspendedAt: null,
    closedAt: null,
    passwordHash: "stored-hash",
  };
}
