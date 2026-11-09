import assert from "node:assert/strict";
import test from "node:test";
import { detailDescription } from "./copy.ts";
import { allotmentIsIndexable, browseIsIndexable, calendarIsIndexable, compareIsIndexable, listedIsIndexable } from "./indexing.ts";
import { indexablePaths, privateRobotsPaths, siteUrl } from "./site.ts";
import { sitemapEntries } from "./sitemap-entries.ts";
import { collectionDocument, ipoPageDocument, websiteDocument } from "./structured-data.ts";
import { defaultBrowseQuery } from "../../features/ipos/browse.ts";
import { parseListedQuery } from "../../features/ipos/listed.ts";

const origin = new URL("https://ipo.example/");

const offer = {
  companyName: "Stored Mills",
  board: "mainboard" as const,
  status: "open" as const,
  offer: {
    priceBand: { lowRupees: null, highRupees: null },
    issuePriceRupees: null,
  },
  slug: "stored-mills",
  dates: { openDate: "2026-10-01", closeDate: null, allotmentDate: null, listingDate: null },
};

function hasKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => hasKey(item, key));
  if (value && typeof value === "object") {
    return Object.entries(value).some(([name, child]) => name === key || hasKey(child, key));
  }
  return false;
}

test("accepts a public site origin and refuses a vendor host", () => {
  assert.equal(siteUrl(""), null);
  assert.equal(siteUrl("https://www.ipoguru.in"), null);
  assert.equal(siteUrl("https://user:secret@ipo.example"), null);
  assert.equal(siteUrl("https://ipo.example/app"), null);
  assert.equal(siteUrl("https://ipo.example/?q=1"), null);
  assert.equal(siteUrl("https://ipo.example")?.href, "https://ipo.example/");
  assert.equal(siteUrl("http://127.0.0.1:3025")?.origin, "http://127.0.0.1:3025");
  assert.equal(siteUrl("http://127.0.0.1:3025", "production"), null);
  assert.equal(siteUrl("https://random.trycloudflare.com", "production"), null);
  assert.equal(siteUrl("https://www.iposingh.com", "production")?.href, "https://www.iposingh.com/");
});

test("lists stored IPO urls and skips filters, search, and duplicate slugs", async () => {
  const entries = await sitemapEntries(origin, [
    { slug: "stored-mills", updatedAt: "2026-10-02T00:00:00.000Z" },
    { slug: "stored-mills", updatedAt: null },
    { slug: "../admin", updatedAt: null },
    { slug: "sme-alloys", updatedAt: null },
  ]);
  const urls = entries.map((entry) => entry.url);
  assert.equal(urls[0], "https://ipo.example/");
  assert.equal(urls.includes("https://ipo.example/ipos/mainboard"), true);
  assert.equal(urls.includes("https://ipo.example/ipos/sme"), true);
  assert.equal(urls.includes("https://ipo.example/ipos/stored-mills"), true);
  assert.equal(urls.includes("https://ipo.example/ipos/sme-alloys"), true);
  assert.equal(urls.filter((url) => url.endsWith("/ipos/stored-mills")).length, 1);
  assert.equal(urls.some((url) => url.includes("?")), false);
  assert.equal(urls.some((url) => url.includes("/search")), false);
  assert.equal(urls.some((url) => privateRobotsPaths.some((path) => url.endsWith(path))), false);
  assert.equal(entries.find((entry) => entry.url.endsWith("/stored-mills"))?.lastModified?.toISOString(), "2026-10-02T00:00:00.000Z");
  assert.equal(entries.find((entry) => entry.url.endsWith("/sme-alloys"))?.lastModified, undefined);
  const staticAndArticles = urls.filter((url) => !url.includes("/ipos/stored") && !url.includes("/ipos/sme-alloys"));
  assert.equal(staticAndArticles.length >= indexablePaths.length, true);
  assert.equal(urls.some((url) => url.includes("/news")), true);
});

test("private robots paths keep account surfaces and placeholders out of crawlers", () => {
  assert.equal(privateRobotsPaths.includes("/admin"), true);
  assert.equal(privateRobotsPaths.includes("/search"), true);
  assert.equal(privateRobotsPaths.includes("/gmp"), true);
  assert.equal(privateRobotsPaths.includes("/subscription"), true);
  assert.equal(privateRobotsPaths.includes("/api/"), true);
  assert.equal(privateRobotsPaths.includes("/ipo-unavailable"), true);
  const indexed = new Set<string>(indexablePaths.map((item) => item.path));
  assert.equal(indexed.has("/search"), false);
  assert.equal(indexed.has("/admin"), false);
  assert.equal(indexed.has("/gmp"), false);
});

test("indexes the clean landing pages and leaves filtered urls out", () => {
  assert.equal(browseIsIndexable(defaultBrowseQuery, 1), true);
  assert.equal(browseIsIndexable({ ...defaultBrowseQuery, status: "open" }, 1), false);
  assert.equal(browseIsIndexable(defaultBrowseQuery, 2), false);
  assert.equal(listedIsIndexable(parseListedQuery({})), true);
  assert.equal(listedIsIndexable(parseListedQuery({ board: "mainboard" })), false);
  assert.equal(calendarIsIndexable({}), true);
  assert.equal(calendarIsIndexable({ month: "2026-10" }), false);
  assert.equal(compareIsIndexable({ slugs: [], q: "" }), true);
  assert.equal(compareIsIndexable({ slugs: ["stored-mills"], q: "" }), false);
  assert.equal(allotmentIsIndexable(undefined), true);
  assert.equal(allotmentIsIndexable("mainboard"), false);
  assert.equal(allotmentIsIndexable("sme"), false);
});

test("describes stored prices and omits a missing price", () => {
  const missing = detailDescription(offer);
  assert.equal(missing.includes("₹0"), false);
  assert.equal(missing.includes("Mainboard"), true);
  assert.equal(missing.includes("Open"), true);
  const band = detailDescription({
    ...offer,
    offer: { priceBand: { lowRupees: 100, highRupees: 110 }, issuePriceRupees: null },
  });
  assert.equal(band.includes("₹100"), true);
  assert.equal(band.includes("₹110"), true);
  const zero = detailDescription({
    ...offer,
    offer: { priceBand: { lowRupees: null, highRupees: null }, issuePriceRupees: 0 },
  });
  assert.equal(zero.includes("₹0"), true);
});

test("Open, Upcoming, and Listed detail copy stays status-specific without GMP", () => {
  const open = detailDescription({
    ...offer,
    status: "open",
    dates: { openDate: "2026-10-01", closeDate: "2026-10-03", listingDate: null },
  });
  const upcoming = detailDescription({
    ...offer,
    status: "upcoming",
    dates: { openDate: "2026-11-10", closeDate: null, listingDate: null },
  });
  const listed = detailDescription({
    ...offer,
    status: "listed",
    offer: { priceBand: { lowRupees: null, highRupees: null }, issuePriceRupees: 95 },
    dates: { openDate: "2026-09-01", closeDate: "2026-09-03", listingDate: "2026-09-10" },
  });
  assert.equal(open.includes("Open"), true);
  assert.equal(open.includes("Closes 2026-10-03"), true);
  assert.equal(upcoming.includes("Upcoming"), true);
  assert.equal(upcoming.includes("Opens 2026-11-10"), true);
  assert.equal(listed.includes("Listed"), true);
  assert.equal(listed.includes("Listed 2026-09-10"), true);
  assert.equal(listed.includes("₹95"), true);
  assert.equal(open.toLowerCase().includes("gmp"), false);
  assert.equal(upcoming.toLowerCase().includes("rating"), false);
});

test("structured data uses stored fields and no reviews or ratings", () => {
  const page = ipoPageDocument(origin, offer);
  const text = JSON.stringify(page);
  assert.equal(page["@type"], "WebPage");
  assert.equal(text.includes("aggregateRating"), false);
  assert.equal(text.includes("review"), false);
  assert.equal(text.includes("ratingValue"), false);
  assert.equal(text.includes("gmp"), false);
  assert.equal(text.includes("₹0"), false);
  assert.equal(text.includes("2026-10-01"), true);
  const priced = ipoPageDocument(origin, {
    ...offer,
    offer: { priceBand: { lowRupees: 0, highRupees: 10 }, issuePriceRupees: null },
  });
  const prices = JSON.stringify(priced);
  assert.equal(prices.includes("\"unitText\":\"INR\""), true);
  assert.equal(prices.includes("\"value\":0"), true);
  assert.equal(collectionDocument(origin, { name: "Mainboard IPOs", path: "/ipos/mainboard", description: "Mainboard", items: [] }), null);
  const site = websiteDocument(origin);
  assert.equal(JSON.stringify(site).includes("aggregateRating"), false);
  assert.equal(hasKey(site, "reviewCount"), false);
});
