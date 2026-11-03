import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError } from "../shared/errors.ts";
import { assertSafeDatabase, parseMongoTarget } from "./mongo-target.ts";

const secret = "super-secret-value";

describe("parseMongoTarget", () => {
  it("keeps the host and database and drops userinfo", () => {
    const target = parseMongoTarget(`mongodb://app-user:${secret}@127.0.0.1:27017/ipo-singh-dev?authSource=admin`);
    assert.deepEqual(target, { host: "127.0.0.1:27017", database: "ipo-singh-dev" });
    assert.equal(JSON.stringify(target).includes(secret), false);
  });

  it("accepts a replica-set host list and an SRV host", () => {
    assert.deepEqual(parseMongoTarget("mongodb://db-1:27017,db-2:27017/ipo-singh-test"), {
      host: "db-1:27017,db-2:27017",
      database: "ipo-singh-test",
    });
    assert.deepEqual(parseMongoTarget("mongodb+srv://cluster.example.net/ipo-singh-dev"), {
      host: "cluster.example.net",
      database: "ipo-singh-dev",
    });
  });

  it("leaves a missing database path empty and rejects other schemes", () => {
    assert.deepEqual(parseMongoTarget("mongodb+srv://cluster.example.net"), {
      host: "cluster.example.net",
      database: null,
    });
    assert.deepEqual(parseMongoTarget("mongodb://127.0.0.1:27017/"), {
      host: "127.0.0.1:27017",
      database: null,
    });
    assert.equal(parseMongoTarget(`http://127.0.0.1:27017/ipo-singh-dev`), null);
    assert.equal(parseMongoTarget(`mongodb://127.0.0.1:27017/ipo-singh-dev/${secret}`), null);
  });
});

describe("assertSafeDatabase", () => {
  it("isolates production from staging and development database names", () => {
    assertSafeDatabase("production", "ipo-singh");
    assert.throws(() => assertSafeDatabase("production", "ipo-singh-staging"), ConfigError);
    assert.throws(() => assertSafeDatabase("production", "ipo-singh-dev"), ConfigError);
    assert.throws(() => assertSafeDatabase("development", "ipo-singh"), ConfigError);
    assert.throws(() => assertSafeDatabase("test", "ipo-singh-prod"), ConfigError);
    assertSafeDatabase("development", "ipo-singh-dev");
    assertSafeDatabase("test", "ipo-singh-test");
    assertSafeDatabase("staging", "ipo-singh-staging");
    assertSafeDatabase("development", "ipo-singh-staging");
    assert.throws(() => assertSafeDatabase("development", "ipo-singh-staging-prod"), ConfigError);
  });
});
