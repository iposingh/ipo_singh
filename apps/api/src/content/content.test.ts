import {
  adminArticleSchema,
  articleFinancialDisclaimer,
  publicArticleListSchema,
  publicArticleResponseSchema,
} from "@ipo-singh/contracts";
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
import { createMemoryArticleStore } from "./memory-store.ts";
import { articleParagraphs, sanitizeArticleMarkdown } from "./sanitize.ts";
import { seedArticleRecords } from "./seed.ts";

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

describe("editorial articles", () => {
  const servers: RunningServer[] = [];
  after(async () => {
    await Promise.all(servers.map((item) => item.shutdown()));
  });

  it("sanitizes markup and keeps educational seed paragraphs", () => {
    assert.equal(sanitizeArticleMarkdown("Hello <script>alert(1)</script> world"), "Hello alert(1) world");
    assert.deepEqual(articleParagraphs("One.\n\nTwo."), ["One.", "Two."]);
    assert.equal(seedArticleRecords().every((article) => article.status === "published"), true);
    assert.match(articleFinancialDisclaimer, /not investment advice/i);
  });

  it("lists only published articles and supports category and search filters", async () => {
    const accounts = createMemoryAccountStore();
    const audit = createMemoryAdminAuditStore();
    const articles = createMemoryArticleStore();
    const database: DatabaseHandle = {
      async check() {
        return "ok";
      },
      async close() {
        return undefined;
      },
      accounts,
      adminAudit: audit,
      articles,
    };
    const server = await startServer(config(), quiet(), database, undefined, undefined, {
      hasher: createFastPasswordHasher(),
      attempts: createLoginAttemptLimiter({ maxFailures: 20, windowMs: 60_000 }),
    });
    servers.push(server);

    const listed = publicArticleListSchema.parse(
      await (await fetch(`${server.url}/api/v1/articles`, { headers: { connection: "close" } })).json(),
    );
    assert.equal(listed.items.length, 2);
    assert.match(listed.disclaimer, /not investment advice/i);
    assert.equal(listed.items.some((item) => item.category === "gmp-updates"), true);

    const guides = publicArticleListSchema.parse(
      await (await fetch(`${server.url}/api/v1/articles?category=allotment-updates`, { headers: { connection: "close" } })).json(),
    );
    assert.equal(guides.items.length, 1);
    assert.equal(guides.items[0]?.slug, "how-ipo-allotment-status-works");

    const searched = publicArticleListSchema.parse(
      await (await fetch(`${server.url}/api/v1/articles?q=grey`, { headers: { connection: "close" } })).json(),
    );
    assert.equal(searched.items.length, 1);

    const badCategory = await fetch(`${server.url}/api/v1/articles?category=rumours`, { headers: { connection: "close" } });
    assert.equal(badCategory.status, 400);
    await badCategory.arrayBuffer();

    const detail = publicArticleResponseSchema.parse(
      await (
        await fetch(`${server.url}/api/v1/articles/what-is-grey-market-premium`, { headers: { connection: "close" } })
      ).json(),
    );
    assert.equal(detail.article.title.includes("<"), false);
    assert.match(detail.article.bodyMarkdown, /unofficial/i);

    const draft = await articles.find("what-is-gmp");
    assert.ok(draft);
    await articles.save({ ...draft, status: "draft" });
    const hidden = await fetch(`${server.url}/api/v1/articles/what-is-grey-market-premium`, { headers: { connection: "close" } });
    assert.equal(hidden.status, 404);
    await hidden.arrayBuffer();

    const register = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ email: "editor@example.com", password, displayName: "Editor" }),
    });
    assert.equal(register.status, 201);
    const cookies = register.headers.getSetCookie();
    await register.arrayBuffer();
    const staff = await accounts.findUserByEmail("editor@example.com");
    assert.ok(staff);
    await accounts.saveUser({ ...staff, role: "super-admin" });

    const created = adminArticleSchema.parse(
      await (
        await fetch(`${server.url}/api/v1/admin/articles`, {
          method: "POST",
          headers: authHeaders(cookies),
          body: JSON.stringify({
            title: "IPO calendar basics",
            summary: "How IPO Singh shows opening and closing dates in India Standard Time.",
            category: "ipo-updates",
            authorName: "IPO Singh Editorial",
            sourceName: "IPO Singh",
            bodyMarkdown: "Dates stay date-only.\n\nNo invented listings.",
            relatedIpoSlugs: [],
            citations: [],
            evergreen: true,
            cover: null,
            publishedAt: null,
          }),
        })
      ).json(),
    );
    assert.equal(created.status, "draft");
    const published = adminArticleSchema.parse(
      await (
        await fetch(`${server.url}/api/v1/admin/articles/${created.id}/publish`, {
          method: "POST",
          headers: authHeaders(cookies),
          body: "{}",
        })
      ).json(),
    );
    assert.equal(published.status, "published");
    const live = publicArticleListSchema.parse(
      await (await fetch(`${server.url}/api/v1/articles?category=ipo-updates`, { headers: { connection: "close" } })).json(),
    );
    assert.equal(live.items.some((item) => item.slug === created.slug), true);
  });
});
