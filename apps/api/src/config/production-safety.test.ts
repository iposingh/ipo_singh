import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readAlertPolicy } from "./alert-policy.ts";
import { readConfig } from "./env.ts";
import { assertSafeDatabase } from "../db/mongo-target.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("production kill switches and alert digests stay off by default", () => {
  const alerts = readAlertPolicy({});
  assert.equal(alerts.pushDeliveryEnabled, false);
  assert.equal(alerts.closeHourIst, null);
  assert.equal(alerts.mainboardMaxNonCriticalPerDay, 3);
  assert.equal(process.env.ALLOTMENT_BROADCAST_ENABLED === "true", false);
  assert.equal(process.env.PUSH_DELIVERY_ENABLED === "true", false);
});

test("non-production Mongo targets cannot use production-looking database names", () => {
  assert.throws(() => assertSafeDatabase("development", "ipo-singh"), /ConfigError|MONGODB/);
  assert.throws(() => assertSafeDatabase("development", "ipo-singh-prod"), /ConfigError|MONGODB/);
  assert.doesNotThrow(() => assertSafeDatabase("development", "ipo-singh-dev"));
  assert.doesNotThrow(() => assertSafeDatabase("development", "ipo-singh-staging"));
  assert.doesNotThrow(() => assertSafeDatabase("staging", "ipo-singh-staging"));
  assert.throws(() => assertSafeDatabase("staging", "ipo-singh"), /ConfigError|MONGODB/);
  assert.throws(() => assertSafeDatabase("staging", "ipo-singh-prod"), /ConfigError|MONGODB/);
  assert.doesNotThrow(() => assertSafeDatabase("production", "ipo-singh"));
  assert.throws(() => assertSafeDatabase("production", "ipo-singh-staging"), /ConfigError|MONGODB/);
  assert.throws(() => assertSafeDatabase("production", "ipo-singh-dev"), /ConfigError|MONGODB/);
});

test("production refuses the mock market-data provider", () => {
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
    (error: unknown) => error instanceof Error && String(error).includes("IPO_DATA_PROVIDER"),
  );
});

test("production and staging require HTTPS CORS and refuse tunnel origins", () => {
  assert.throws(
    () =>
      readConfig(
        {
          NODE_ENV: "production",
          MONGODB_URI: "mongodb://127.0.0.1:27017/ipo-singh",
        },
        "0.1.0",
      ),
    (error: unknown) => error instanceof Error && String(error).includes("CORS_ORIGINS"),
  );
  assert.throws(
    () =>
      readConfig(
        {
          NODE_ENV: "production",
          CORS_ORIGINS: "https://random.trycloudflare.com",
          MONGODB_URI: "mongodb://127.0.0.1:27017/ipo-singh",
        },
        "0.1.0",
      ),
    (error: unknown) => error instanceof Error && String(error).includes("CORS_ORIGINS"),
  );
  const staging = readConfig(
    {
      NODE_ENV: "production",
      IPO_SINGH_DEPLOYMENT: "staging",
      CORS_ORIGINS: "https://staging.example.com",
      MONGODB_URI: "mongodb://127.0.0.1:27017/ipo-singh-staging",
    },
    "0.1.0",
  );
  assert.equal(staging.deployment, "staging");
  assert.equal(staging.cache.environment, "staging");
  assert.deepEqual([...staging.corsOrigins], ["https://staging.example.com"]);
});

test("API env example documents kill switches, board allotment policy, and isolated data stores", () => {
  const example = readFileSync(join(root, ".env.example"), "utf8");
  assert.match(example, /PUSH_DELIVERY_ENABLED=false/);
  assert.match(example, /ALLOTMENT_BROADCAST_ENABLED=false/);
  assert.match(example, /Mainboard → opted-in/);
  assert.match(example, /SME → watchlisted/);
  assert.match(example, /ALERT_MAINBOARD_MAX_NONCRITICAL_PER_DAY/);
  assert.match(example, /IPO_SINGH_DEPLOYMENT/);
  assert.match(example, /dev.*test.*staging|staging/);
  assert.match(example, /Cloudflare Tunnel/);
  assert.equal(example.includes("IPO_GURU_API_KEY=sk-"), false);
  assert.equal(/mongodb\+srv:\/\/[^:]+:[^@]+@/.test(example), false);
});
