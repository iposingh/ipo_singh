import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError } from "../shared/errors.ts";
import { cacheEnvironmentSegment, readDeploymentEnv } from "./deployment.ts";
import { cacheKey } from "../cache/keys.ts";

describe("deployment lane", () => {
  it("defaults from NODE_ENV and allows an explicit staging override", () => {
    assert.equal(readDeploymentEnv({}, "development"), "development");
    assert.equal(readDeploymentEnv({}, "test"), "test");
    assert.equal(readDeploymentEnv({}, "production"), "production");
    assert.equal(
      readDeploymentEnv({ IPO_SINGH_DEPLOYMENT: "staging" }, "production"),
      "staging",
    );
    assert.throws(
      () => readDeploymentEnv({ IPO_SINGH_DEPLOYMENT: "production" }, "development"),
      ConfigError,
    );
  });

  it("isolates Redis cache and lock key prefixes by lane", () => {
    assert.equal(cacheEnvironmentSegment("production"), "prod");
    assert.equal(cacheEnvironmentSegment("staging"), "staging");
    assert.equal(cacheEnvironmentSegment("development"), "dev");
    assert.equal(cacheEnvironmentSegment("test"), "test");

    const prod = cacheKey({
      version: 1,
      environment: "prod",
      namespace: "provider",
      resource: "gmp",
      id: "issue-1",
    });
    const staging = cacheKey({
      version: 1,
      environment: "staging",
      namespace: "provider",
      resource: "gmp",
      id: "issue-1",
    });
    assert.equal(prod, "ipo-singh:prod:v1:provider:gmp:issue-1");
    assert.equal(staging, "ipo-singh:staging:v1:provider:gmp:issue-1");
    assert.notEqual(prod, staging);
  });
});
