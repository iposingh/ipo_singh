import assert from "node:assert/strict";
import test from "node:test";
import type { IpoSummary } from "@ipo-singh/contracts";
import {
  emptySearchFilters,
  parseSearchFilters,
  parseSearchRequestKey,
  searchBoxKey,
  searchCatalogQuery,
  searchPath,
  searchRequestKey,
} from "./query.ts";
import {
  nextSuggestionIndex,
  parseSuggestionResponse,
  publicSuggestions,
  shouldRequestSuggestions,
  suggestionRequestKey,
} from "./suggestions.ts";

const summary: IpoSummary = {
  id: "stored-mills",
  slug: "stored-mills",
  companyName: "Stored Mills",
  board: "sme",
  status: "open",
  openDate: "2026-10-01",
  closeDate: "2026-10-03",
  gmpAmountRupees: null,
  subscriptionTotalTimes: null,
  provenance: { sourceName: "IPO Singh", retrievedAt: null, freshness: "missing" },
};

test("parses a search address and keeps special characters", () => {
  const empty = parseSearchFilters({});
  assert.deepEqual(empty, emptySearchFilters);
  assert.equal(searchPath(empty), "/search");
  assert.equal(searchCatalogQuery(parseSearchFilters({ q: "a" })), null);

  const encoded = parseSearchFilters({ q: "  a&b  " });
  assert.equal(encoded.q, "a&b");
  assert.equal(encoded.rejected, "none");
  assert.equal(new URL(searchPath(encoded), "http://localhost").searchParams.get("q"), "a&b");
  assert.equal(parseSearchFilters({ q: ["mills", "other"] }).q, "mills");
  assert.equal(parseSearchFilters({ q: "a".repeat(90) }).q.length, 80);
});

test("rejects unsafe text, inverted dates, and unknown filters before a request", () => {
  const markup = parseSearchFilters({ q: "<script>" });
  assert.equal(markup.rejected, "text");
  assert.equal(markup.queryText, "<script>");
  assert.equal(searchCatalogQuery(markup), null);
  assert.equal(searchPath(markup), "/search");
  assert.equal(parseSearchFilters({ q: "a\nb" }).rejected, "text");
  assert.equal(searchBoxKey(parseSearchFilters({ q: "a\nb" })).includes("\n"), false);

  const inverted = parseSearchFilters({ q: "mills", from: "2026-10-31", to: "2026-10-01" });
  assert.equal(inverted.rejected, "dates");
  assert.equal(inverted.from, "2026-10-31");
  assert.equal(searchCatalogQuery(inverted), null);
  assert.equal(parseSearchFilters({ q: "mills", from: "2026-02-31" }).rejected, "dates");
  assert.equal(parseSearchFilters({ q: "mills", board: "neither" }).rejected, "filters");

  const range = parseSearchFilters({ q: "mills", board: "sme", status: "open", from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(searchCatalogQuery(range), {
    q: "mills",
    board: "sme",
    status: "open",
    from: "2026-10-01",
    to: "2026-10-31",
  });
});

test("keeps a valid cursor and drops one that cannot be sent", () => {
  const page = parseSearchFilters({ q: "mills", cursor: "MTA" });
  assert.equal(page.cursor, "MTA");
  assert.equal(page.cursorIgnored, false);
  assert.equal(searchPath(page), "/search?q=mills&cursor=MTA");
  assert.equal(searchPath({ ...page, board: "mainboard", cursor: null }), "/search?q=mills&board=mainboard");

  const ignored = parseSearchFilters({ q: "mills", cursor: "<bad>" });
  assert.equal(ignored.cursor, null);
  assert.equal(ignored.cursorIgnored, true);
  assert.equal(searchCatalogQuery(ignored)?.cursor, undefined);
});

test("round-trips the search cache key", () => {
  const key = searchRequestKey({ q: "a&b", board: "sme", from: "2026-10-01" });
  assert.deepEqual(parseSearchRequestKey(key), { q: "a&b", board: "sme", from: "2026-10-01" });
  assert.equal(parseSearchRequestKey("nope"), null);
  assert.equal(parseSearchRequestKey(JSON.stringify({ q: "<script>" })), null);
});

test("moves the suggestion highlight and skips a repeated request", () => {
  assert.equal(nextSuggestionIndex(-1, "ArrowDown", 3), 0);
  assert.equal(nextSuggestionIndex(2, "ArrowDown", 3), 0);
  assert.equal(nextSuggestionIndex(0, "ArrowUp", 3), 2);
  assert.equal(nextSuggestionIndex(1, "Home", 3), 0);
  assert.equal(nextSuggestionIndex(1, "End", 3), 2);
  assert.equal(nextSuggestionIndex(1, "Escape", 3), "close");
  assert.equal(nextSuggestionIndex(1, "Enter", 3), "submit");
  assert.equal(nextSuggestionIndex(-1, "ArrowDown", 0), "unchanged");

  const key = suggestionRequestKey({ q: "mills", board: "all", status: "all", from: "", to: "" });
  assert.equal(shouldRequestSuggestions("mills", true, key, null), true);
  assert.equal(shouldRequestSuggestions("mills", true, key, key), false);
  assert.equal(shouldRequestSuggestions("m", true, key, null), false);
  assert.equal(shouldRequestSuggestions("mills", false, key, null), false);
});

test("suggestion payloads keep only public fields", () => {
  const published = publicSuggestions([summary]);
  assert.deepEqual(Object.keys(published[0] ?? {}), ["slug", "companyName", "board", "status"]);
  const parsed = parseSuggestionResponse({
    items: [{ ...published[0], providerId: "secret", id: "stored-mills" }, { slug: "../admin", companyName: "X", board: "sme", status: null }],
  });
  assert.deepEqual(parsed.items, [{ slug: "stored-mills", companyName: "Stored Mills", board: "sme", status: "open" }]);
  assert.equal(JSON.stringify(parsed).includes("providerId"), false);
});
