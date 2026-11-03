import assert from "node:assert/strict";
import test from "node:test";
import { providerObservedAt } from "./updated-at.ts";

test("last updated uses the latest provider observation and ignores a missing timestamp", () => {
  const latest = providerObservedAt({
    gmp: { observedAt: "2026-10-18T04:00:00.000Z" },
    subscription: { observedAt: "2026-10-18T09:00:00.000Z" },
  });
  assert.equal(latest?.toISOString(), "2026-10-18T09:00:00.000Z");
  assert.equal(providerObservedAt({ gmp: { observedAt: null }, subscription: null }), null);
  assert.equal(providerObservedAt({ gmp: { observedAt: "not-a-time" }, subscription: { observedAt: null } }), null);
});
