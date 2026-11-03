import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redact, redactString } from "./redact.ts";

describe("redact", () => {
  it("redacts sensitive keys and keeps ordinary values, including zero and null", () => {
    const redacted = redact({
      authorization: "Bearer super-secret-value",
      cookie: "session=abc",
      nested: {
        apiKey: "provider-key",
        password: "hunter2",
        company: "Sample Forge",
        gmpRupees: 0,
        issuePriceRupees: null,
      },
      notes: ["Bearer raw-token-value", { token: "again" }],
    });

    const serialized = JSON.stringify(redacted);
    assert.equal(serialized.includes("super-secret-value"), false);
    assert.equal(serialized.includes("provider-key"), false);
    assert.equal(serialized.includes("hunter2"), false);
    assert.equal(serialized.includes("raw-token-value"), false);
    assert.equal(serialized.includes("session=abc"), false);
    assert.match(serialized, /Sample Forge/);
    assert.match(serialized, /"gmpRupees":0/);
    assert.match(serialized, /"issuePriceRupees":null/);
  });

  it("stops walking very deep objects", () => {
    let value: Record<string, unknown> = { name: "leaf" };
    for (let index = 0; index < 12; index += 1) {
      value = { child: value };
    }
    const redacted = redact(value);
    assert.match(JSON.stringify(redacted), /\[truncated\]/);
  });

  it("scrubs credentials embedded in text", () => {
    assert.equal(redactString("Authorization failed for Bearer super-secret-value"), "Authorization failed for Bearer [redacted]");
    assert.equal(redactString("token ExponentPushToken[abcdefghijklmnop] failed").includes("abcdefghijklmnop"), false);
    assert.equal(redactString("apiKey=super-secret-value"), "apiKey=[redacted]");
    const uri = redactString("connect ECONNREFUSED mongodb://app-user:super-secret-value@127.0.0.1:27017/ipo-singh-dev");
    assert.equal(uri.includes("super-secret-value"), false);
    assert.match(uri, /mongodb:\/\/\[redacted\]/);
    const redis = redactString("connect ECONNREFUSED redis://:super-secret-value@127.0.0.1:6379/0");
    assert.equal(redis.includes("super-secret-value"), false);
    assert.match(redis, /redis:\/\/\[redacted\]/);
  });

  it("redacts PAN and application numbers without keeping the value", () => {
    const redacted = redact({
      pan: "ABCDE1234F",
      applicationNumber: "APP-100",
      company: "Sample Forge",
    });
    const serialized = JSON.stringify(redacted);
    assert.equal(serialized.includes("ABCDE1234F"), false);
    assert.equal(serialized.includes("APP-100"), false);
    assert.match(serialized, /Sample Forge/);
    assert.equal(redactString("holder ABCDE1234F filed").includes("ABCDE1234F"), false);
  });
});
