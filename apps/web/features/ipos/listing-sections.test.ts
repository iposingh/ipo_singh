import assert from "node:assert/strict";
import test from "node:test";
import { defaultBrowseQuery } from "./browse.ts";
import { isListingOverview, listingPath, listingSections, paginateItems, parseListingPage, statusFilterPath } from "./listing-sections.ts";

test("mainboard and sme sections keep their own routes and sorts", () => {
  const mainboard = listingSections("mainboard");
  const sme = listingSections("sme");
  assert.deepEqual(
    mainboard.map((section) => section.id),
    ["open", "upcoming", "closed", "listed"],
  );
  assert.equal(mainboard.every((section) => section.href.startsWith("/ipos/mainboard")), true);
  assert.equal(sme.every((section) => section.href.startsWith("/ipos/sme")), true);
  assert.equal(mainboard[0]?.query.sort, "close");
  assert.equal(mainboard[0]?.query.direction, "asc");
  assert.equal(sme[2]?.query.status, "closed");
  assert.equal(sme[2]?.query.direction, "desc");
  assert.equal(sme[3]?.href, "/ipos/sme?status=listed&sort=listing&direction=desc");
  assert.equal(statusFilterPath("mainboard", "all", ""), "/ipos/mainboard");
  assert.equal(statusFilterPath("sme", "open", "forge"), "/ipos/sme?q=forge&status=open&sort=close");
});

test("the default board query is the four-section overview", () => {
  assert.equal(isListingOverview(defaultBrowseQuery), true);
  assert.equal(isListingOverview({ ...defaultBrowseQuery, status: "listed" }), false);
  assert.equal(isListingOverview({ ...defaultBrowseQuery, q: "forge" }), false);
  assert.equal(isListingOverview({ ...defaultBrowseQuery, direction: "desc" }), false);
});

test("pagination does not invent a page of issues", () => {
  const rows = Array.from({ length: 21 }, (_, index) => index);
  assert.equal(paginateItems(rows, 1).pageItems.length, 20);
  assert.deepEqual(paginateItems(rows, 2).pageItems, [20]);
  assert.equal(paginateItems(rows, 2).pageCount, 2);
  assert.deepEqual(paginateItems(rows, 3).pageItems, []);
  assert.deepEqual(paginateItems([], 4).pageItems, []);
  assert.equal(parseListingPage("2"), 2);
  assert.equal(parseListingPage("0"), 1);
  assert.equal(parseListingPage("101"), 1);
  assert.equal(listingPath("mainboard", defaultBrowseQuery, 2), "/ipos/mainboard?page=2");
  assert.equal(listingPath("sme", { q: "", status: "open", sort: "close", direction: "asc" }, 1), "/ipos/sme?status=open&sort=close");
});
