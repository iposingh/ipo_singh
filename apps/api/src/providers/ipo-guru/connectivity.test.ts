import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readConfig } from "../../config/env.ts";
import { createLogger } from "../../shared/logger.ts";
import { createIpoGuruClient } from "./client.ts";

const authorized = process.env.IPOGURU_CONNECTIVITY_TEST === "1";
const key = authorized ? process.env.IPOGURU_API_KEY?.trim() : undefined;
const minute = authorized ? process.env.IPOGURU_MINUTE_BUDGET?.trim() : undefined;
const daily = authorized ? process.env.IPOGURU_DAILY_BUDGET?.trim() : undefined;

describe("IPO Guru connectivity", { skip: !authorized || !key || !minute || !daily }, () => {
  it("performs one authorized GET /me", async () => {
    const lines: string[] = [];
    const config = readConfig(
      {
        IPOGURU_ENABLED: "true",
        IPOGURU_API_KEY: key,
        IPOGURU_MINUTE_BUDGET: minute,
        IPOGURU_DAILY_BUDGET: daily,
        IPOGURU_BASE_URL: "https://www.ipoguru.in/api/v2",
      },
      "0.1.0",
    );
    const client = createIpoGuruClient({
      settings: config.ipoGuru,
      quotaPolicy: { ...config.quota, maxRetries: 0, reservedRequests: 0 },
      logger: createLogger({ level: "info", service: "test", sink: (line) => lines.push(line) }),
    });
    const account = await client.readAccount();
    assert.equal(typeof account.plan, "string");
    assert.ok(account.scopes.length >= 0);
    assert.equal(typeof account.limits.perMinute, "number");
    assert.equal(typeof account.limits.perDay, "number");
    const written = `${lines.join("\n")}${JSON.stringify(account)}`;
    assert.equal(written.includes(key ?? ""), false);
    assert.equal(written.toLowerCase().includes("x-api-key"), false);
  });
});
