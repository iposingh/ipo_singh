import { adminBannerSchema, promotionEventAcceptedSchema, publicPromotionResponseSchema } from "@ipo-singh/contracts";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createMemoryAdminAuditStore } from "../accounts/audit.ts";
import { createLoginAttemptLimiter } from "../accounts/attempts.ts";
import { createMemoryAccountStore } from "../accounts/memory-store.ts";
import { createFastPasswordHasher } from "../accounts/passwords.ts";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import type { AppConfig } from "../config/env.ts";
import { defaultHttpLimits } from "../config/http-limits.ts";
import { disabledIpoGuruConfig } from "../config/ipoguru.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import { startServer, type RunningServer } from "../index.ts";
import { createLogger } from "../shared/logger.ts";
import { readPromotionEventTotals, resetPromotionEventsForTests } from "./events.ts";
import { createMemoryPromotionStore } from "./memory-store.ts";

const password = "Horse-battery-99";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

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
    rateLimit: { ...http.rateLimit, authPerWindow: 100, adminPerWindow: 100 },
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

function quiet() {
  return createLogger({ level: "error", service: "ipo-singh-api", sink: () => undefined });
}

function cookieHeader(setCookies: readonly string[]): string {
  return setCookies.map((line) => line.split(";")[0] ?? "").join("; ");
}

function cookieValue(setCookies: readonly string[], name: string): string {
  const line = setCookies.find((item) => item.startsWith(`${name}=`));
  return decodeURIComponent((line?.split(";")[0] ?? "").slice(name.length + 1));
}

function authHeaders(setCookies: readonly string[], extra?: Record<string, string>): Headers {
  return new Headers({
    cookie: cookieHeader(setCookies),
    "content-type": "application/json",
    "x-csrf-token": cookieValue(setCookies, "ipo_singh_csrf"),
    connection: "close",
    ...extra,
  });
}

const bannerBody = {
  title: "Mainboard IPOs",
  description: "Browse stored Mainboard issues on IPO Singh.",
  destinationUrl: "/ipos/mainboard",
  placement: "home",
  priority: 1,
  sponsored: false,
  disclosure: null,
  startAt: null,
  endAt: null,
};

describe("promotional banners", () => {
  const servers: RunningServer[] = [];
  after(async () => {
    await Promise.all(servers.map((item) => item.shutdown()));
  });

  it("schedules, orders, and hides invalid or inactive banners from the public carousel", async () => {
    const accounts = createMemoryAccountStore();
    const audit = createMemoryAdminAuditStore();
    const promotions = createMemoryPromotionStore();
    const database: DatabaseHandle = {
      async check() { return "ok"; },
      async close() { return undefined; },
      accounts,
      adminAudit: audit,
      promotions,
    };
    const server = await startServer(config(), quiet(), database, undefined, undefined, {
      hasher: createFastPasswordHasher(),
      attempts: createLoginAttemptLimiter({ maxFailures: 20, windowMs: 60_000 }),
    });
    servers.push(server);

    const empty = publicPromotionResponseSchema.parse(await (await fetch(`${server.url}/api/v1/promotions`, { headers: { connection: "close" } })).json());
    assert.equal(empty.managed, false);
    assert.deepEqual(empty.slides, []);
    const anonymous = await fetch(`${server.url}/api/v1/admin/banners`, { headers: { connection: "close" } });
    assert.equal(anonymous.status, 401);
    await anonymous.arrayBuffer();

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
    const adminCookies = await register("staff@example.com");
    const staff = await accounts.findUserByEmail("staff@example.com");
    assert.ok(staff);
    await accounts.saveUser({ ...staff, role: "admin" });
    const memberDenied = await fetch(`${server.url}/api/v1/admin/banners`, { method: "POST", headers: authHeaders(memberCookies), body: JSON.stringify(bannerBody) });
    assert.equal(memberDenied.status, 403);
    await memberDenied.arrayBuffer();

    const markup = await fetch(`${server.url}/api/v1/admin/banners`, {
      method: "POST",
      headers: authHeaders(adminCookies),
      body: JSON.stringify({ ...bannerBody, title: "<script>alert(1)</script>" }),
    });
    assert.equal(markup.status, 400);
    await markup.arrayBuffer();
    const vendor = await fetch(`${server.url}/api/v1/admin/banners`, {
      method: "POST",
      headers: authHeaders(adminCookies),
      body: JSON.stringify({ ...bannerBody, sponsored: true, disclosure: "advertisement", destinationUrl: "https://www.ipoguru.in/offer" }),
    });
    assert.equal(vendor.status, 400);
    await vendor.arrayBuffer();
    const externalHouse = await fetch(`${server.url}/api/v1/admin/banners`, {
      method: "POST",
      headers: authHeaders(adminCookies),
      body: JSON.stringify({ ...bannerBody, destinationUrl: "https://example.com/offer" }),
    });
    assert.equal(externalHouse.status, 400);
    await externalHouse.arrayBuffer();

    const created = adminBannerSchema.parse(await (await fetch(`${server.url}/api/v1/admin/banners`, {
      method: "POST",
      headers: authHeaders(adminCookies),
      body: JSON.stringify(bannerBody),
    })).json());
    assert.equal(created.status, "draft");
    assert.equal(created.preview, null);

    const badUpload = await fetch(`${server.url}/api/v1/admin/banners/${created.id}/images?slot=desktop`, {
      method: "POST",
      headers: authHeaders(adminCookies, { "content-type": "image/svg+xml" }),
      body: Buffer.from("<svg><script>alert(1)</script></svg>"),
    });
    assert.equal(badUpload.status, 400);
    await badUpload.arrayBuffer();
    const mismatch = await fetch(`${server.url}/api/v1/admin/banners/${created.id}/images?slot=desktop`, {
      method: "POST",
      headers: authHeaders(adminCookies, { "content-type": "image/jpeg" }),
      body: png,
    });
    assert.equal(mismatch.status, 400);
    await mismatch.arrayBuffer();

    async function upload(id: string, slot: "desktop" | "mobile") {
      const response = await fetch(`${server.url}/api/v1/admin/banners/${id}/images?slot=${slot}`, {
        method: "POST",
        headers: authHeaders(adminCookies, { "content-type": "image/png" }),
        body: png,
      });
      assert.equal(response.status, 200);
      return adminBannerSchema.parse(await response.json());
    }

    await upload(created.id, "desktop");
    const withImages = await upload(created.id, "mobile");
    assert.ok(withImages.preview);
    assert.equal(withImages.preview.disclosure, null);
    assert.match(withImages.preview.image.desktop.src, /^\/api\/admin\/banners\/media\/image-/);

    const early = await fetch(`${server.url}/api/v1/admin/banners/${created.id}/activate`, { method: "POST", headers: authHeaders(adminCookies), body: "{}" });
    assert.equal(early.status, 200);
    await early.arrayBuffer();
    const live = publicPromotionResponseSchema.parse(await (await fetch(`${server.url}/api/v1/promotions`)).json());
    assert.equal(live.managed, true);
    assert.equal(live.slides.length, 1);
    assert.equal(live.slides[0]?.href, "/ipos/mainboard");
    assert.equal(live.slides[0]?.disclosure, null);
    const image = await fetch(`${server.url}${live.slides[0]?.image.desktop.src.replace("/api/promotions/", "/api/v1/promotions/")}`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal(image.headers.get("x-content-type-options"), "nosniff");
    const bytes = Buffer.from(await image.arrayBuffer());
    assert.equal(bytes.equals(png), true);

    const later = adminBannerSchema.parse(await (await fetch(`${server.url}/api/v1/admin/banners`, {
      method: "POST",
      headers: authHeaders(adminCookies),
      body: JSON.stringify({
        ...bannerBody,
        title: "Example sponsor",
        description: "A future paid placement with its own destination.",
        destinationUrl: "https://example.com/offer",
        priority: 5,
        sponsored: true,
        disclosure: "sponsored",
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-02-01T00:00:00.000Z",
      }),
    })).json());
    await upload(later.id, "desktop");
    await upload(later.id, "mobile");
    const activated = await fetch(`${server.url}/api/v1/admin/banners/${later.id}/activate`, { method: "POST", headers: authHeaders(adminCookies), body: "{}" });
    assert.equal(activated.status, 200);
    await activated.arrayBuffer();
    const ended = publicPromotionResponseSchema.parse(await (await fetch(`${server.url}/api/v1/promotions`)).json());
    assert.deepEqual(ended.slides.map((slide) => slide.id), [created.id]);

    const openEnded = await fetch(`${server.url}/api/v1/admin/banners/${later.id}`, {
      method: "PATCH",
      headers: authHeaders(adminCookies),
      body: JSON.stringify({
        ...bannerBody,
        title: "Example sponsor",
        description: "A future paid placement with its own destination.",
        destinationUrl: "https://example.com/offer",
        priority: 5,
        sponsored: true,
        disclosure: "sponsored",
        startAt: null,
        endAt: null,
      }),
    });
    assert.equal(openEnded.status, 200);
    await openEnded.arrayBuffer();
    const ordered = publicPromotionResponseSchema.parse(await (await fetch(`${server.url}/api/v1/promotions`)).json());
    assert.deepEqual(ordered.slides.map((slide) => slide.id), [later.id, created.id]);
    assert.equal(ordered.slides[0]?.disclosure, "sponsored");

    const reordered = await fetch(`${server.url}/api/v1/admin/banners/reorder`, {
      method: "POST",
      headers: authHeaders(adminCookies),
      body: JSON.stringify({ ids: [created.id, later.id] }),
    });
    assert.equal(reordered.status, 200);
    await reordered.arrayBuffer();
    const samePriority = await fetch(`${server.url}/api/v1/admin/banners/${later.id}`, {
      method: "PATCH",
      headers: authHeaders(adminCookies),
      body: JSON.stringify({
        title: "Example sponsor",
        description: "A future paid placement with its own destination.",
        destinationUrl: "https://example.com/offer",
        placement: "home",
        priority: 1,
        sponsored: true,
        disclosure: "sponsored",
        startAt: null,
        endAt: null,
      }),
    });
    assert.equal(samePriority.status, 200);
    await samePriority.arrayBuffer();
    const afterReorder = publicPromotionResponseSchema.parse(await (await fetch(`${server.url}/api/v1/promotions`)).json());
    assert.deepEqual(afterReorder.slides.map((slide) => slide.id), [created.id, later.id]);

    const future = await fetch(`${server.url}/api/v1/admin/banners/${created.id}`, {
      method: "PATCH",
      headers: authHeaders(adminCookies),
      body: JSON.stringify({ ...bannerBody, startAt: "2099-01-01T00:00:00.000Z" }),
    });
    assert.equal(future.status, 200);
    await future.arrayBuffer();
    const waiting = publicPromotionResponseSchema.parse(await (await fetch(`${server.url}/api/v1/promotions`)).json());
    assert.equal(waiting.slides.some((slide) => slide.id === created.id), false);

    const activeDelete = await fetch(`${server.url}/api/v1/admin/banners/${later.id}`, { method: "DELETE", headers: authHeaders(adminCookies) });
    assert.equal(activeDelete.status, 409);
    await activeDelete.arrayBuffer();
    const archived = await fetch(`${server.url}/api/v1/admin/banners/${later.id}/archive`, { method: "POST", headers: authHeaders(adminCookies), body: "{}" });
    assert.equal(archived.status, 200);
    await archived.arrayBuffer();
    const hidden = await fetch(`${server.url}${ordered.slides[0]?.image.desktop.src.replace("/api/promotions/", "/api/v1/promotions/")}`);
    assert.equal(hidden.status, 404);
    await hidden.arrayBuffer();
    const removed = await fetch(`${server.url}/api/v1/admin/banners/${later.id}`, { method: "DELETE", headers: authHeaders(adminCookies) });
    assert.equal(removed.status, 204);
    await removed.arrayBuffer();
    const events = await audit.listRecent(20);
    assert.equal(events.some((event) => event.action === "banner_change" && event.outcome === "succeeded"), true);
    assert.equal(JSON.stringify(waiting).includes("<script"), false);
  });

  it("accepts aggregate promotion events without personal fields", async () => {
    resetPromotionEventsForTests();
    const database: DatabaseHandle = {
      async check() { return "ok"; },
      async close() { return undefined; },
      accounts: createMemoryAccountStore(),
      adminAudit: createMemoryAdminAuditStore(),
      promotions: createMemoryPromotionStore(),
    };
    const server = await startServer(config(), quiet(), database, undefined, undefined, {
      hasher: createFastPasswordHasher(),
      attempts: createLoginAttemptLimiter({ maxFailures: 20, windowMs: 60_000 }),
    });
    servers.push(server);

    const bad = await fetch(`${server.url}/api/v1/promotions/events`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ bannerId: "mainboard", event: "impression", placement: "home", userId: "u-1" }),
    });
    assert.equal(bad.status, 400);
    await bad.arrayBuffer();

    const ok = await fetch(`${server.url}/api/v1/promotions/events`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ bannerId: "mainboard", event: "impression", placement: "home" }),
    });
    assert.equal(ok.status, 202);
    assert.deepEqual(promotionEventAcceptedSchema.parse(await ok.json()), { accepted: true });
    assert.deepEqual(readPromotionEventTotals("mainboard"), { impressions: 1, clicks: 0 });

    const click = await fetch(`${server.url}/api/v1/promotions/events`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ bannerId: "mainboard", event: "click", placement: "home" }),
    });
    assert.equal(click.status, 202);
    await click.arrayBuffer();
    assert.deepEqual(readPromotionEventTotals("mainboard"), { impressions: 1, clicks: 1 });
  });
});
