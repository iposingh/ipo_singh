import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRedisStore, type RedisCommandClient } from "./redis-store.ts";

function fakeClient() {
  const values = new Map<string, string>();
  const calls: string[] = [];
  const client: RedisCommandClient = {
    async get(key) {
      calls.push(`get ${key}`);
      return values.get(key) ?? null;
    },
    async set(key, value, expiryMode, ttlMs, setMode) {
      calls.push(`set ${key} ${expiryMode} ${ttlMs} ${setMode ?? ""}`.trim());
      if (setMode === "NX" && values.has(key)) return null;
      values.set(key, value);
      return "OK";
    },
    async del(...keys) {
      calls.push(`del ${keys.join(",")}`);
      let removed = 0;
      for (const key of keys) {
        if (values.delete(key)) removed += 1;
      }
      return removed;
    },
    async scan(cursor, matchMode, pattern) {
      calls.push(`scan ${cursor} ${matchMode} ${pattern}`);
      const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
      const keys = [...values.keys()].filter((key) => key.startsWith(prefix));
      return ["0", keys];
    },
    async eval(_script, _keyCount, ...args) {
      calls.push(`eval ${args.join(" ")}`);
      const [key, token] = args;
      if (!key || values.get(key) !== token) return 0;
      values.delete(key);
      return 1;
    },
    async incr(key) {
      calls.push(`incr ${key}`);
      const next = Number(values.get(key) ?? "0") + 1;
      values.set(key, String(next));
      return next;
    },
    async pexpire(key, ttlMs) {
      calls.push(`pexpire ${key} ${ttlMs}`);
      return values.has(key) ? 1 : 0;
    },
    async ping() {
      calls.push("ping");
      return "PONG";
    },
    async quit() {
      calls.push("quit");
      return "OK";
    },
  };
  return { client, calls, values };
}

describe("redis command store", () => {
  it("maps cache commands onto Redis without a live server", async () => {
    const { client, calls, values } = fakeClient();
    const store = createRedisStore(client);
    await store.set("ipo-singh:v1:provider:gmp:issue-1", "{\"v\":1}", 900_000);
    assert.equal(await store.get("ipo-singh:v1:provider:gmp:issue-1"), "{\"v\":1}");
    assert.equal(await store.setIfAbsent("lock:issue-1", "token-a", 10_000), true);
    assert.equal(await store.setIfAbsent("lock:issue-1", "token-b", 10_000), false);
    assert.equal(await store.compareAndDelete("lock:issue-1", "token-b"), false);
    assert.equal(await store.compareAndDelete("lock:issue-1", "token-a"), true);
    values.set("ipo-singh:v1:public:gmp:issue-1", "public");
    await store.deleteByPrefix("ipo-singh:v1:provider:gmp:issue-1");
    assert.equal(values.has("ipo-singh:v1:provider:gmp:issue-1"), false);
    assert.equal(values.has("ipo-singh:v1:public:gmp:issue-1"), true);
    assert.equal(await store.increment("minute:1", 60_000), 1);
    assert.equal(await store.increment("minute:1", 60_000), 2);
    assert.equal(await store.read("minute:1"), 2);
    assert.equal(await store.read("minute:missing"), 0);
    assert.equal(await store.ping(), true);
    await store.close();
    assert.ok(calls.some((call) => call === "set ipo-singh:v1:provider:gmp:issue-1 PX 900000"));
    assert.ok(calls.some((call) => call === "set lock:issue-1 PX 10000 NX"));
    assert.equal(calls.filter((call) => call.startsWith("pexpire minute:1")).length, 1);
    assert.ok(calls.includes("quit"));
  });
});
