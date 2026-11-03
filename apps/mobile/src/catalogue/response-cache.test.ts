import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  cachePolicies,
  catalogueFreshMs,
  invalidateCached,
  memoryJsonCache,
  readCached,
  writeCached,
} from "./response-cache.ts";

const bodySchema = z.object({ value: z.number() });
const now = new Date("2026-10-26T12:00:00.000Z");

test("cache policies keep listings shorter than history and match the listings alias", () => {
  assert.equal(cachePolicies.listings.freshMs, catalogueFreshMs);
  assert.equal(cachePolicies.listings.freshMs, 5 * 60 * 1000);
  assert.equal(cachePolicies.issue.freshMs, 3 * 60 * 1000);
  assert.equal(cachePolicies.history.freshMs, 15 * 60 * 1000);
  assert.equal(cachePolicies.promotions.freshMs, 10 * 60 * 1000);
  assert.ok(cachePolicies.history.freshMs > cachePolicies.listings.freshMs);
  assert.ok(cachePolicies.listings.freshMs > cachePolicies.issue.freshMs);
});

test("readCached respects resource fresh windows and invalidate drops the entry", async () => {
  const store = memoryJsonCache();
  await writeCached(store, "issue-key", { value: 7 }, now);

  const freshIssue = await readCached(store, "issue-key", bodySchema, new Date(now.getTime() + 2 * 60 * 1000), false, cachePolicies.issue);
  assert.equal(freshIssue.hit, "fresh");

  const staleForIssue = await readCached(store, "issue-key", bodySchema, new Date(now.getTime() + 4 * 60 * 1000), false, cachePolicies.issue);
  assert.equal(staleForIssue.hit, "miss");

  const stillFreshAsList = await readCached(store, "issue-key", bodySchema, new Date(now.getTime() + 4 * 60 * 1000), false, cachePolicies.listings);
  assert.equal(stillFreshAsList.hit, "fresh");

  await invalidateCached(store, "issue-key");
  const gone = await readCached(store, "issue-key", bodySchema, now, true, cachePolicies.issue);
  assert.equal(gone.hit, "miss");
});
