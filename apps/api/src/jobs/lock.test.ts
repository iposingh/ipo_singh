import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStore } from "../cache/memory-store.ts";
import { createSyncLock } from "./lock.ts";

describe("createSyncLock", () => {
  it("fails closed when no shared store is configured", async () => {
    const locks = createSyncLock(null);
    assert.equal(await locks.acquire("catalog", 1_000), null);
  });

  it("allows a single-process local lock only when opted in", async () => {
    const locks = createSyncLock(null, { allowProcessLocal: true });
    const release = await locks.acquire("catalog", 1_000);
    assert.ok(release);
    assert.equal(await locks.acquire("catalog", 1_000), null);
    await release();
    const again = await locks.acquire("catalog", 1_000);
    assert.ok(again);
    await again();
  });

  it("coordinates across lock instances that share a store", async () => {
    const store = createMemoryStore(() => Date.now());
    const first = createSyncLock(store);
    const second = createSyncLock(store);
    const release = await first.acquire("gmp", 5_000);
    assert.ok(release);
    assert.equal(await second.acquire("gmp", 5_000), null);
    await release();
    const next = await second.acquire("gmp", 5_000);
    assert.ok(next);
    await next();
  });

  it("fails closed when the shared store rejects setIfAbsent", async () => {
    const locks = createSyncLock({
      async setIfAbsent() {
        throw new Error("Redis unavailable");
      },
      async compareAndDelete() {
        return false;
      },
    });
    assert.equal(await locks.acquire("alerts", 1_000), null);
  });
});
