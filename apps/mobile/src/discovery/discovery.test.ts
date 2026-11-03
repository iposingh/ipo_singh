import assert from "node:assert/strict";
import test from "node:test";
import { ipoSchema, type CalendarEntry, type Ipo } from "@ipo-singh/contracts";
import { actualListingGainPercent, formatSignedPercent } from "@ipo-singh/core";
import { loadCalendarRange, loadSearchPage } from "../catalogue/load.ts";
import { issueRoute } from "../catalogue/routes.ts";
import {
  calendarBoardParam,
  dateInMonth,
  eventCounts,
  eventsOn,
  indiaWeekdayMondayIndex,
  monthBounds,
  monthWeeks,
  selectedCalendarDay,
  shiftMonth,
  sortDayEvents,
} from "./calendar.ts";
import { compareNote, compareTable } from "./compare.ts";
import { calendarRequestPath, searchRequestPath } from "./requests.ts";
import { canCompare, compareColumnWidth, toggleCompareSlug } from "./selection.ts";

const provenance = { sourceName: "IPO Singh", retrievedAt: "2026-10-25T12:00:00.000Z", freshness: "fresh" as const };

const summary = {
  id: "fixture-polymers",
  slug: "fixture-polymers",
  companyName: "Fixture Polymers",
  board: "mainboard" as const,
  status: "open" as const,
  openDate: "2024-02-01",
  closeDate: "2024-02-05",
  gmpAmountRupees: null,
  subscriptionTotalTimes: 0,
  provenance,
};

function entry(
  date: string,
  event: CalendarEntry["event"],
  companyName = "Fixture Polymers",
  board: CalendarEntry["ipo"]["board"] = "mainboard",
  slug = "fixture-polymers",
): CalendarEntry {
  return {
    date,
    event,
    ipo: { ...summary, id: slug, slug, companyName, board, openDate: date },
  };
}

function storedIpo(patch: Partial<Ipo> = {}): Ipo {
  return ipoSchema.parse({
    id: "fixture-polymers",
    slug: "fixture-polymers",
    companyName: "Fixture Polymers",
    board: "mainboard",
    status: "listed",
    offer: {
      priceBand: { lowRupees: 100, highRupees: 110 },
      issuePriceRupees: 100,
      issueSizeRupees: 0,
      lotSizeShares: 10,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: "2026-10-20", closeDate: "2026-10-22", allotmentDate: "2026-10-24", listingDate: "2026-10-27" },
    gmp: { amountRupees: 0, percent: 0, indicativeImpliedPriceRupees: null, observedAt: "2026-10-25T09:00:00.000Z", freshness: "stale" },
    subscription: { retailTimes: 0, qibTimes: null, niiTimes: null, employeeTimes: null, totalTimes: 0, observedAt: null, freshness: "fresh" },
    financials: [{ fiscalYearLabel: "FY2025", revenueRupees: null, profitAfterTaxRupees: 0, earningsPerShareRupees: null }],
    registrar: null,
    documents: [],
    listing: { issuePriceRupees: 100, listingPriceRupees: 125, gainPercent: null, listedOn: "2026-10-27" },
    provenance,
    ...patch,
  });
}

test("a calendar month keeps stored dates and leaves an empty day empty", () => {
  assert.deepEqual(monthBounds("2024-02"), { from: "2024-02-01", to: "2024-02-29", label: "February 2024" });
  assert.deepEqual(monthBounds("2025-02"), { from: "2025-02-01", to: "2025-02-28", label: "February 2025" });
  assert.equal(shiftMonth("2024-02", 1), "2024-03");
  assert.equal(shiftMonth("2024-12", 1), "2025-01");
  assert.equal(shiftMonth("2025-01", -1), "2024-12");
  assert.equal(shiftMonth("2024-13", 1), null);
  assert.equal(indiaWeekdayMondayIndex("2024-02-01"), 3);
  assert.equal(indiaWeekdayMondayIndex("2026-11-01"), 6);
  assert.equal(dateInMonth("2024-02-29", "2024-02"), true);
  assert.equal(dateInMonth("2024-03-01", "2024-02"), false);

  const weeks = monthWeeks("2024-02", [
    entry("2024-02-01", "open"),
    entry("2024-03-01", "listing"),
    entry("2024-02-01", "close"),
    entry("2024-02-01", "open"),
  ]);
  const first = weeks[0]?.[3];
  assert.equal(first?.date, "2024-02-01");
  assert.deepEqual(first?.events.map((item) => item.event), ["open", "close"]);
  assert.equal(eventsOn(weeks, "2024-02-02").length, 0);
  assert.equal(eventsOn(weeks, "2024-03-01").length, 0);
  assert.deepEqual(eventCounts(first?.events ?? []), { open: 1, close: 1, allotment: 0, listing: 0 });

  const path = calendarRequestPath({ board: "sme", from: "2024-02-01", to: "2024-02-29", limit: 100 });
  assert.equal(path, "/api/v1/calendar?board=sme&from=2024-02-01&to=2024-02-29&limit=100");
  assert.equal(path.includes("ipoguru"), false);
  assert.equal(calendarBoardParam("mainboard"), "mainboard");
  assert.equal(calendarBoardParam("all"), undefined);
  const route = issueRoute(summary.slug);
  assert.equal(route?.pathname, "/ipo/[slug]");
  assert.equal(route?.params.slug, summary.slug);
});

test("calendar selection, board filtering, and day order stay date-only", () => {
  assert.equal(selectedCalendarDay({ month: "2026-11", selected: "2026-11-15", today: "2026-11-02" }), "2026-11-15");
  assert.equal(selectedCalendarDay({ month: "2026-11", selected: "2026-10-31", today: "2026-11-02" }), "2026-11-02");
  assert.equal(selectedCalendarDay({ month: "2026-10", selected: "2026-11-02", today: "2026-11-02" }), "2026-10-01");
  assert.equal(selectedCalendarDay({ month: "2026-11", selected: null, today: null }), "2026-11-01");

  const ordered = sortDayEvents([
    entry("2026-11-10", "listing", "Zebra SME", "sme", "zebra-sme"),
    entry("2026-11-10", "open", "Alpha Main", "mainboard", "alpha-main"),
    entry("2026-11-10", "allotment", "Alpha Main", "mainboard", "alpha-main"),
    entry("2026-11-10", "close", "Beta SME", "sme", "beta-sme"),
    entry("2026-11-10", "open", "Beta SME", "sme", "beta-sme"),
  ]);
  assert.deepEqual(
    ordered.map((item) => `${item.event}:${item.ipo.slug}`),
    ["open:alpha-main", "open:beta-sme", "close:beta-sme", "allotment:alpha-main", "listing:zebra-sme"],
  );

  const weeks = monthWeeks("2026-11", [
    entry("2026-11-10", "open", "Alpha Main", "mainboard", "alpha-main"),
    entry("2026-11-10", "open", "Beta SME", "sme", "beta-sme"),
    entry("2026-11-12", "allotment", "Revised Co", "mainboard", "revised-co"),
  ]);
  const day = eventsOn(weeks, "2026-11-10");
  assert.deepEqual(
    day.map((item) => item.ipo.board),
    ["mainboard", "sme"],
  );
  assert.equal(eventsOn(weeks, "2026-11-11").length, 0);
  assert.equal(eventsOn(weeks, "2026-11-12")[0]?.event, "allotment");

  assert.equal(issueRoute("alpha-main")?.params.slug, "alpha-main");
  assert.equal(calendarRequestPath({ board: "mainboard", from: "2026-11-01", to: "2026-11-30", limit: 100 }), "/api/v1/calendar?board=mainboard&from=2026-11-01&to=2026-11-30&limit=100");
});

test("search sends a partial name with board and status and leaves an empty result empty", async () => {
  assert.equal(searchRequestPath("p"), null);
  assert.equal(searchRequestPath(" poly "), "/api/v1/search?q=poly&limit=20");
  assert.equal(searchRequestPath("poly", { board: "mainboard", status: "open" }), "/api/v1/search?q=poly&limit=20&board=mainboard&status=open");
  assert.equal(
    searchRequestPath("poly", { board: "sme", status: "closed", sort: "close", direction: "desc" }, "next"),
    "/api/v1/search?q=poly&limit=20&board=sme&status=closed&sort=close&direction=desc&cursor=next",
  );
  const origin = "https://api.example.com";
  const empty = await loadSearchPage("poly", {
    origin,
    board: "sme",
    sort: "open",
    direction: "asc",
    fetchImpl: async (url) => {
      assert.equal(String(url), `${origin}/api/v1/search?q=poly&limit=20&board=sme&sort=open&direction=asc`);
      assert.equal(String(url).includes("ipoguru"), false);
      return new Response(JSON.stringify({ items: [], page: { limit: 20, nextCursor: null, totalCount: 0 } }), { status: 200 });
    },
  });
  assert.deepEqual(empty, { status: "ready", items: [], nextCursor: null });
});

test("a calendar range follows the next page and does not keep a failed page as dates", async () => {
  const origin = "https://api.example.com";
  const page = { date: "2024-02-01", event: "open", ipo: summary };
  let calls = 0;
  const loaded = await loadCalendarRange({
    origin,
    from: "2024-02-01",
    to: "2024-02-29",
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ items: [page], page: { limit: 100, nextCursor: "next", totalCount: null } }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [], page: { limit: 100, nextCursor: null, totalCount: 1 } }), { status: 200 });
    },
  });
  assert.equal(loaded.status, "ready");
  if (loaded.status === "ready") assert.equal(loaded.items.length, 1);

  const failed = await loadCalendarRange({
    origin,
    from: "2024-02-01",
    to: "2024-02-29",
    fetchImpl: async () => new Response(JSON.stringify({ items: [{ companyName: "Sample Co" }] }), { status: 200 }),
  });
  assert.equal(failed.status, "unavailable");
});

test("comparison accepts 2 to 4 stored IPOs and keeps a missing figure unavailable", () => {
  assert.equal(canCompare(["fixture-polymers"]), false);
  const first = toggleCompareSlug([], "fixture-polymers");
  const second = toggleCompareSlug(first.slugs, "other-mills");
  const third = toggleCompareSlug(second.slugs, "third-mills");
  const fourth = toggleCompareSlug(third.slugs, "fourth-mills");
  const fifth = toggleCompareSlug(fourth.slugs, "fifth-mills");
  assert.equal(fifth.rejected, "full");
  assert.equal(fifth.slugs.length, 4);
  assert.equal(canCompare(fourth.slugs), true);
  assert.equal(toggleCompareSlug(fourth.slugs, "Fixture").rejected, "invalid");
  assert.deepEqual(toggleCompareSlug(["fixture-polymers"], "fixture-polymers").slugs, []);

  const gain = actualListingGainPercent({ listingPriceRupees: 125, issuePriceRupees: 100 });
  const table = compareTable([
    { state: "stored", ipo: storedIpo() },
    {
      state: "stored",
      ipo: storedIpo({
        id: "other-mills",
        slug: "other-mills",
        companyName: "Other Mills",
        gmp: null,
        financials: [],
        listing: null,
        offer: {
          priceBand: { lowRupees: null, highRupees: null },
          issuePriceRupees: null,
          issueSizeRupees: null,
          lotSizeShares: null,
          minimumInvestmentRupees: null,
        },
      }),
    },
    { state: "missing", slug: "absent-mills" },
  ]);
  const byId = new Map(table.map((row) => [row.id, row.values]));
  assert.equal(byId.get("gmp")?.[0]?.includes("0"), true);
  assert.equal(byId.get("gmp")?.[1], "GMP unavailable");
  assert.equal(byId.get("price-band")?.[1], "Unavailable");
  assert.equal(byId.get("lot")?.[1], "Unavailable");
  assert.equal(byId.get("issue-size")?.[0]?.includes("0"), true);
  assert.equal(byId.get("issue-size")?.[1], "Unavailable");
  assert.equal(byId.get("subscription-QIB")?.[0], "Unavailable");
  assert.equal(byId.get("revenue-FY2025")?.[0], "Unavailable");
  assert.equal(byId.get("profit-FY2025")?.[0]?.includes("0"), true);
  assert.equal(byId.get("revenue-FY2025")?.[1], "Unavailable");
  assert.equal(byId.get("listing-gain")?.[0], gain.status === "value" ? formatSignedPercent(gain.value) : "Unavailable");
  assert.equal(byId.get("listing-price")?.[1], "Unavailable");
  assert.equal(byId.get("company")?.[2], "This IPO is not stored.");
  assert.equal(compareNote.includes("recommend"), true);
  assert.equal(compareNote.toLowerCase().includes("buy"), false);
  const narrow = compareColumnWidth(320);
  assert.ok(narrow.label + narrow.value * 2 > 320);
});
