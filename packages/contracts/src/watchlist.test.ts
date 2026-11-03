import assert from "node:assert/strict";
import test from "node:test";
import { saveWatchlistRequestSchema, watchlistItemSchema } from "./watchlist.ts";

test("a watchlist save names an IPO id and rejects copied market data", () => {
  assert.equal(saveWatchlistRequestSchema.safeParse({ ipoId: "fixture-polymers", gmpAmountRupees: 10 }).success, false);
  assert.equal(saveWatchlistRequestSchema.safeParse({ ipoId: "fixture-polymers", userId: "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f" }).success, false);
  assert.equal(saveWatchlistRequestSchema.parse({ ipoId: "fixture-polymers" }).ipoId, "fixture-polymers");
  const item = watchlistItemSchema.parse({
    ipoId: "fixture-polymers",
    addedAt: "2026-10-23T12:00:00.000Z",
    note: null,
    availability: "unavailable",
    ipo: null,
  });
  assert.equal(item.ipo, null);
  assert.equal(JSON.stringify(item).includes("passwordHash"), false);
});
