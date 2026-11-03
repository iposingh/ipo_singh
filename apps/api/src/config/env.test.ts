import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError } from "../shared/errors.ts";
import { readConfig } from "./env.ts";

const secret = "super-secret-value";

describe("readConfig", () => {
  it("uses deployment defaults for an empty development environment", () => {
    const config = readConfig({}, "0.1.0");
    assert.equal(config.nodeEnv, "development");
    assert.equal(config.deployment, "development");
    assert.equal(config.cache.environment, "dev");
    assert.equal(config.host, "0.0.0.0");
    assert.equal(config.port, 4000);
    assert.deepEqual(config.corsOrigins, ["http://localhost:3000"]);
    assert.equal(config.logLevel, "info");
    assert.equal(config.requestBodyLimit, "100kb");
    assert.equal(config.shutdownTimeoutMs, 10_000);
    assert.equal(config.trustProxy, false);
    assert.equal(config.serviceName, "ipo-singh-api");
    assert.equal(config.mongodb, null);
    assert.equal(config.redis, null);
    assert.equal(config.cache.resources.gmp.freshMs, 120 * 60 * 1000);
    assert.equal(config.cache.resources.subscription.freshMs, 60 * 60 * 1000);
    assert.equal(config.cache.subscriptionClosingFreshMs, 30 * 60 * 1000);
    assert.equal(config.cache.resources.listings.freshMs, 24 * 60 * 60 * 1000);
    assert.equal(config.cache.resources.issue.freshMs, 24 * 60 * 60 * 1000);
    assert.equal(config.cache.resources.history.freshMs, 7 * 24 * 60 * 60 * 1000);
    assert.equal(config.cache.resources.registrars.freshMs, 24 * 60 * 60 * 1000);
    assert.equal(config.cache.resources.listing.freshMs, 24 * 60 * 60 * 1000);
    assert.equal(config.cache.directoryRefreshMinute, 8 * 60);
    assert.equal(config.quota.requestsPerMinute, 30);
    assert.equal(config.quota.requestsPerDay, 1000);
    assert.equal(config.quota.reservedRequests, 50);
    assert.equal(config.provider, null);
    assert.equal(config.ipoGuru.enabled, false);
    assert.equal(config.opsToken, null);
    assert.equal(config.internalServiceToken, null);
    assert.equal(config.rateLimit.cataloguePerWindow, 300);
    assert.equal(config.rateLimit.searchPerWindow, 60);
    assert.equal(config.rateLimit.detailPerWindow, 120);
    assert.equal(config.rateLimit.authPerWindow, 10);
    assert.equal(config.rateLimit.adminPerWindow, 120);
    assert.equal(config.requestTimeoutMs, 15_000);
    assert.equal(config.headersTimeoutMs, 10_000);
    assert.equal(config.keepAliveTimeoutMs, 5_000);
  });

  it("requires HTTPS CORS origins for production and staging deployments", () => {
    assert.throws(
      () => readConfig({ NODE_ENV: "production", MONGODB_URI: "mongodb://127.0.0.1:27017/ipo-singh" }, "0.1.0"),
      ConfigError,
    );
    const config = readConfig(
      {
        NODE_ENV: "production",
        CORS_ORIGINS: "https://www.example.com",
        MONGODB_URI: "mongodb://127.0.0.1:27017/ipo-singh",
      },
      "0.1.0",
    );
    assert.deepEqual(config.corsOrigins, ["https://www.example.com"]);
    assert.equal(config.deployment, "production");
    assert.equal(config.cache.environment, "prod");
    assert.equal(config.trustProxy, false);
    assert.equal(config.mongodb?.database, "ipo-singh");
  });

  it("parses explicit origins, proxy mode, and a blank port as the default", () => {
    const config = readConfig(
      {
        NODE_ENV: "production",
        PORT: "",
        MONGODB_URI: "mongodb://127.0.0.1:27017/ipo-singh",
        TRUST_PROXY: "true",
        CORS_ORIGINS: "https://www.example.com/, https://app.example.com",
        REQUEST_BODY_LIMIT: "1KB",
      },
      "0.1.0",
    );
    assert.equal(config.port, 4000);
    assert.equal(config.trustProxy, true);
    assert.equal(config.requestBodyLimit, "1kb");
    assert.deepEqual(config.corsOrigins, ["https://www.example.com", "https://app.example.com"]);
  });

  it("names invalid fields and omits the supplied values", () => {
    assert.throws(
      () =>
        readConfig(
          {
            NODE_ENV: secret,
            PORT: "70000",
            CORS_ORIGINS: `http://user:${secret}@localhost:3000`,
          },
          "0.1.0",
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.deepEqual(error.fields, ["NODE_ENV", "PORT"]);
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
  });

  it("requires a production database URI and hides development credentials", () => {
    assert.throws(
      () => readConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://www.example.com" }, "0.1.0"),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.deepEqual(error.fields, ["MONGODB_URI"]);
        return true;
      },
    );

    const config = readConfig(
      { MONGODB_URI: `mongodb://app-user:${secret}@127.0.0.1:27017/ipo-singh-dev` },
      "0.1.0",
    );
    assert.equal(config.mongodb?.host, "127.0.0.1:27017");
    assert.equal(config.mongodb?.database, "ipo-singh-dev");
    const unnamed = readConfig({ MONGODB_URI: "mongodb+srv://app-user:secret@cluster.example.mongodb.net" }, "0.1.0");
    assert.equal(unnamed.mongodb?.database, "ipo-singh-dev");
    assert.equal(unnamed.mongodb?.host, "cluster.example.mongodb.net");
    assert.throws(
      () =>
        readConfig(
          {
            NODE_ENV: "production",
            CORS_ORIGINS: "https://www.example.com",
            MONGODB_URI: "mongodb+srv://cluster.example.net",
          },
          "0.1.0",
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.deepEqual(error.fields, ["MONGODB_URI"]);
        return true;
      },
    );
    assert.equal(config.mongodb?.maxPoolSize, 10);
    assert.equal(config.mongodb?.retention.gmpDays, 400);
    assert.equal(JSON.stringify(config.mongodb).includes(secret), false);

    assert.throws(
      () => readConfig({ MONGODB_URI: `mongodb://app-user:${secret}@127.0.0.1:27017/ipo-singh` }, "0.1.0"),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
  });

  it("keeps a Redis password out of serialized config and rejects a last-known-good window shorter than the fresh TTL", () => {
    const config = readConfig({ REDIS_URL: `redis://:${secret}@127.0.0.1:6379/0` }, "0.1.0");
    assert.equal(JSON.stringify(config.redis).includes(secret), false);
    assert.equal(config.redis?.connectTimeoutMs, 5000);

    assert.throws(
      () => readConfig({ REDIS_URL: `http://127.0.0.1/${secret}` }, "0.1.0"),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.deepEqual(error.fields, ["REDIS_URL"]);
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
    assert.throws(
      () => readConfig({ CACHE_TTL_GMP_MS: "5000", CACHE_STALE_GMP_MS: "1000" }, "0.1.0"),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.deepEqual(error.fields, ["CACHE_STALE_GMP_MS"]);
        return true;
      },
    );
    assert.throws(
      () => readConfig({ PROVIDER_REQUESTS_PER_DAY: "10", PROVIDER_RESERVED_REQUESTS: "10" }, "0.1.0"),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.deepEqual(error.fields, ["PROVIDER_RESERVED_REQUESTS"]);
        return true;
      },
    );
  });

  it("selects a primary provider and refuses a fixture provider in production", () => {
    const selected = readConfig({ IPO_DATA_PROVIDER: "ipo-guru", IPO_DATA_FALLBACK_PROVIDER: "" }, "0.1.0");
    assert.equal(selected.provider?.primary, "ipo-guru");
    assert.equal(selected.provider?.fallback, null);
    assert.equal(selected.provider?.timeoutMs, 8000);

    assert.throws(
      () => readConfig({ IPO_DATA_PROVIDER: "unknown-vendor" }, "0.1.0"),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.deepEqual(error.fields, ["IPO_DATA_PROVIDER"]);
        return true;
      },
    );
    assert.throws(
      () => readConfig({ IPO_DATA_PROVIDER: "ipo-guru", IPO_DATA_FALLBACK_PROVIDER: "ipo-guru" }, "0.1.0"),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.deepEqual(error.fields, ["IPO_DATA_FALLBACK_PROVIDER"]);
        return true;
      },
    );
    assert.throws(
      () =>
        readConfig(
          {
            NODE_ENV: "production",
            CORS_ORIGINS: "https://www.example.com",
            MONGODB_URI: "mongodb://127.0.0.1:27017/ipo-singh",
            IPO_DATA_PROVIDER: "mock",
          },
          "0.1.0",
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.deepEqual(error.fields, ["IPO_DATA_PROVIDER"]);
        assert.equal(error.message.includes("mock"), false);
        return true;
      },
    );
  });

  it("keeps the operations token out of serialized config", () => {
    const token = "development-token-1";
    const config = readConfig({ OPS_TOKEN: token }, "0.1.0");
    assert.equal(config.opsToken, token);
    assert.equal(JSON.stringify(config).includes(token), false);
    assert.throws(
      () => readConfig({ OPS_TOKEN: `bad ${secret}` }, "0.1.0"),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.deepEqual(error.fields, ["OPS_TOKEN"]);
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
  });

  it("rejects rate limits and timeouts that would weaken the safeguards", () => {
    assert.throws(
      () => readConfig({ RATE_LIMIT_SEARCH: "500", RATE_LIMIT_CATALOGUE: "120" }, "0.1.0"),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.deepEqual(error.fields, ["RATE_LIMIT_SEARCH"]);
        assert.equal(error.message.includes("500"), false);
        return true;
      },
    );
    assert.throws(
      () => readConfig({ KEEP_ALIVE_TIMEOUT_MS: "20000", HEADERS_TIMEOUT_MS: secret }, "0.1.0"),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
  });

  it("rejects a wildcard or credential-bearing origin without repeating it", () => {
    assert.throws(
      () => readConfig({ NODE_ENV: "production", CORS_ORIGINS: "*" }, "0.1.0"),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.deepEqual(error.fields, ["CORS_ORIGINS"]);
        return true;
      },
    );
    assert.throws(
      () => readConfig({ NODE_ENV: "production", CORS_ORIGINS: `http://user:${secret}@localhost:3000` }, "0.1.0"),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
  });
});
