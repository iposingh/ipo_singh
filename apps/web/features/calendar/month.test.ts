import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEntry, IpoSummary } from "@ipo-singh/contracts";
import { calendarPath, currentMonth, eventCounts, filterCalendarEntries, indiaWeekdayMondayIndex, monthBounds, monthWeeks, parseCalendarPageQuery, selectedCalendarDay, shiftMonth } from "./month.ts";

const summary: IpoSummary = {
  id: "stored-mills",
  slug: "stored-mills",
  companyName: "Stored Mills",
  board: "mainboard",
  status: "listed",
  openDate: "2024-01-03",
  closeDate: "2024-01-05",
  gmpAmountRupees: 40,
  subscriptionTotalTimes: null,
  provenance: { sourceName: "IPO Singh", retrievedAt: null, freshness: "missing" },
};

function entry(date: string, event: CalendarEntry["event"]): CalendarEntry {
  return { date, event, ipo: summary };
}

test("month bounds follow the India calendar, including leap years", () => {
  assert.deepEqual(monthBounds("2024-02"), { from: "2024-02-01", to: "2024-02-29", label: "February 2024" });
  assert.equal(monthBounds("2023-02")?.to, "2023-02-28");
  assert.equal(monthBounds("2000-02")?.to, "2000-02-29");
  assert.equal(monthBounds("1900-02")?.to, "1900-02-28");
  assert.equal(monthBounds("2024-13"), null);
  assert.equal(shiftMonth("2024-12", 1), "2025-01");
  assert.equal(shiftMonth("2024-01", -1), "2023-12");
});

test("the current month uses the India date when UTC is still the previous day", () => {
  assert.equal(currentMonth(new Date("2026-09-30T18:00:00.000Z")), "2026-09");
  assert.equal(currentMonth(new Date("2026-09-30T18:30:00.000Z")), "2026-10");
  assert.equal(currentMonth(new Date("not-a-date")), null);
});

test("weeks start on Monday and do not invent dates the source omitted", () => {
  assert.equal(indiaWeekdayMondayIndex("2024-01-01"), 0);
  assert.equal(indiaWeekdayMondayIndex("2024-05-01"), 2);
  const weeks = monthWeeks("2024-01", [
    entry("2023-12-31", "listing"),
    entry("2024-01-03", "open"),
    entry("2024-01-05", "close"),
    entry("2024-02-01", "allotment"),
  ]);
  const days = weeks.flat().filter((day) => day !== null);
  assert.equal(days.length, 31);
  assert.equal(weeks[0]?.[0]?.date, "2024-01-01");
  assert.equal(weeks[0]?.[0]?.events.length, 0);
  const third = days.find((day) => day.date === "2024-01-03");
  assert.deepEqual(
    third?.events.map((item) => item.event),
    ["open"],
  );
  assert.equal(days.some((day) => day.events.some((item) => item.event === "allotment" || item.event === "listing")), false);
  const may = monthWeeks("2024-05", []);
  assert.equal(may[0]?.[0], null);
  assert.equal(may[0]?.[1], null);
  assert.equal(may[0]?.[2]?.date, "2024-05-01");
  assert.equal(may.flat().filter((day) => day !== null).every((day) => day.events.length === 0), true);
});

test("event counts stay compact and the same IPO event is not repeated", () => {
  const entries = [entry("2026-10-06", "close"), entry("2026-10-06", "close"), entry("2026-10-06", "allotment"), entry("2026-10-07", "listing")];
  const day = monthWeeks("2026-10", entries).flat().find((item) => item?.date === "2026-10-06");
  assert.equal(day?.events.length, 2);
  assert.deepEqual(eventCounts(day?.events ?? []), { open: 0, close: 1, allotment: 1, listing: 0 });
  assert.equal(filterCalendarEntries(entries, "listing").length, 1);
  assert.equal(selectedCalendarDay({ month: "2026-10", view: "calendar", board: "all", event: "all", day: "2026-11-01" }, "2026-10-21"), "2026-10-21");
  assert.equal(selectedCalendarDay({ month: "2026-11", view: "calendar", board: "all", event: "all", day: null }, "2026-10-21"), "2026-11-01");
});

test("calendar links keep the month, view, and board", () => {
  const now = new Date("2026-10-21T04:00:00.000Z");
  const query = parseCalendarPageQuery({}, now);
  assert.deepEqual(query, { month: "2026-10", view: "calendar", board: "all", event: "all", day: null });
  assert.equal(calendarPath(query ?? { month: "2026-10", view: "calendar", board: "all", event: "all", day: null }), "/ipo-calendar?month=2026-10");
  const filtered = parseCalendarPageQuery({ month: "nope", view: "list", board: "sme", event: "close", day: "2026-10-06" }, now);
  assert.deepEqual(filtered, { month: "2026-10", view: "list", board: "sme", event: "close", day: "2026-10-06" });
  assert.equal(calendarPath(filtered ?? query!), "/ipo-calendar?month=2026-10&view=list&board=sme&event=close&day=2026-10-06");
});
