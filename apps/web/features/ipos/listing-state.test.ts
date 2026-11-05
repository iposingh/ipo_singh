import assert from "node:assert/strict";
import test from "node:test";
import { listingFailureCopy } from "./listing-state.ts";

test("backend timeouts stay visible as errors and are not empty catalogues", () => {
  const copy = listingFailureCopy("backend", "SME IPOs");
  assert.match(copy.title, /could not be reached/);
  assert.match(copy.message, /did not respond/);
  assert.match(copy.message, /not an empty list/);
  assert.equal(copy.message.includes("sample"), true);
});

test("database and unexpected failures keep distinct copy", () => {
  assert.match(listingFailureCopy("database", "Mainboard IPOs").message, /database is unavailable/);
  assert.match(listingFailureCopy("unexpected", "Listed IPOs").message, /could not be used/);
  assert.match(listingFailureCopy("rate_limited", "Calendar").message, /too many requests/);
});
