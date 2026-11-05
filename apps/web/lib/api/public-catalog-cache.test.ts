import assert from "node:assert/strict";
import test from "node:test";
import {
  PublicCatalogMissingError,
  PublicCatalogSearchRejectedError,
  PublicCatalogUnavailableError,
  publicCatalogFreshness,
  publicListingCacheIdentity,
} from "./public-catalog-policy.ts";

test("public catalogue freshness bounds stay short and finite", () => {
  for (const profile of Object.values(publicCatalogFreshness)) {
    assert.ok(profile.stale > 0);
    assert.ok(profile.revalidate >= profile.stale);
    assert.ok(profile.expire > profile.revalidate);
    assert.ok(profile.expire <= 600);
  }
  assert.equal(publicCatalogFreshness.listings.expire, 300);
  assert.equal(publicCatalogFreshness.issue.expire, 300);
  assert.equal(publicCatalogFreshness.history.expire, 600);
});

test("listing cache identity distinguishes board status sort and paging", () => {
  assert.equal(
    publicListingCacheIdentity({ board: "mainboard", status: "open", sort: "close", direction: "asc", page: 1, limit: 8 }),
    publicListingCacheIdentity({ board: "mainboard", status: "open", sort: "close", direction: "asc", page: 1, limit: 8 }),
  );
  assert.notEqual(
    publicListingCacheIdentity({ board: "mainboard", status: "open", sort: "close", direction: "asc", page: 1, limit: 8 }),
    publicListingCacheIdentity({ board: "sme", status: "open", sort: "close", direction: "asc", page: 1, limit: 8 }),
  );
  assert.notEqual(
    publicListingCacheIdentity({ board: "mainboard", status: "open", page: 1, limit: 8 }),
    publicListingCacheIdentity({ board: "mainboard", status: "listed", page: 1, limit: 8 }),
  );
  assert.notEqual(
    publicListingCacheIdentity({ board: "mainboard", status: "open", page: 1, limit: 8 }),
    publicListingCacheIdentity({ board: "mainboard", status: "open", page: 2, limit: 8 }),
  );
});

test("cache miss errors preserve unavailable and missing semantics", () => {
  const unavailable = new PublicCatalogUnavailableError("database");
  assert.equal(unavailable.status, "database");
  assert.equal(new PublicCatalogMissingError().name, "PublicCatalogMissingError");
  assert.equal(new PublicCatalogSearchRejectedError("short").status, "short");
  assert.equal(new PublicCatalogSearchRejectedError("invalid").status, "invalid");
});
