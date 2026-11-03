import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { notificationScopeForBoard } from "../notifications/eligibility.ts";
import { readAlertPolicy } from "./alert-policy.ts";
import { readConfig } from "./env.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(root, "../..");

test("release candidate keeps push and allotment broadcast kill switches off by default", () => {
  const alerts = readAlertPolicy({});
  assert.equal(alerts.pushDeliveryEnabled, false);
  assert.equal(process.env.PUSH_DELIVERY_ENABLED === "true", false);
  assert.equal(process.env.ALLOTMENT_BROADCAST_ENABLED === "true", false);
});

test("release candidate preserves Prompt 76A board audience scopes", () => {
  assert.equal(notificationScopeForBoard("mainboard"), "global");
  assert.equal(notificationScopeForBoard("sme"), "watchlist");
  assert.equal(notificationScopeForBoard(null), "skip");
});

test("staging and production refuse tunnel CORS and require HTTPS website origins", () => {
  assert.throws(() =>
    readConfig(
      {
        NODE_ENV: "production",
        CORS_ORIGINS: "https://tmp.trycloudflare.com",
        MONGODB_URI: "mongodb://127.0.0.1:27017/ipo-singh",
      },
      "0.1.0",
    ),
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
});

test("account deletion and EAS store profiles remain wired for store policy", () => {
  const authRoutes = readFileSync(join(root, "src/accounts/routes.ts"), "utf8");
  assert.match(authRoutes, /\/account\/delete/);
  const eas = readFileSync(join(repoRoot, "apps/mobile/eas.json"), "utf8");
  assert.match(eas, /"production"/);
  assert.match(eas, /"app-bundle"/);
  assert.match(eas, /"preview"/);
});
