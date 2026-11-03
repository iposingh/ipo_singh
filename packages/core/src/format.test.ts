import assert from "node:assert/strict";
import test from "node:test";
import { freshnessLabel, resolveFreshness } from "./freshness.ts";
import { formatGmp, formatInr, formatPriceBand, formatSignedPercent, formatSubscriptionMultiple } from "./money.ts";
import { formatIstDate, formatIstDateTime, formatLastUpdated, istCalendarDate, istCivilDateTime, istDateAnchor } from "./time.ts";

const now = new Date("2026-10-18T06:00:00.000Z");
const fifteenMinutes = 15 * 60 * 1000;

test("INR formatting distinguishes zero from missing values", () => {
  assert.equal(formatInr(0), "₹0");
  assert.equal(formatInr(125), "₹125");
  assert.equal(formatInr(125.5), "₹125.50");
  assert.equal(formatInr(null), "Unavailable");
  assert.equal(formatInr(undefined), "Unavailable");
  assert.equal(formatInr(Number.NaN), "Unavailable");
});

test("GMP formatting keeps the sign and does not invent a missing part", () => {
  assert.equal(formatGmp(125, 18.52), "₹125 (+18.52%)");
  assert.equal(formatGmp(125, -4.5), "₹125 (−4.50%)");
  assert.equal(formatGmp(0, 0), "₹0 (0.00%)");
  assert.equal(formatGmp(null, null), "Unavailable");
  assert.equal(formatGmp(125, null), "₹125 (percent unavailable)");
  assert.equal(formatGmp(null, 18.52), "Amount unavailable (+18.52%)");
});

test("signed percents keep a non-color direction cue", () => {
  assert.equal(formatSignedPercent(18.52), "+18.52%");
  assert.equal(formatSignedPercent(-3), "−3.00%");
  assert.equal(formatSignedPercent(0), "0.00%");
  assert.equal(formatSignedPercent(undefined), "Unavailable");
});

test("subscription multiples and price bands", () => {
  assert.equal(formatSubscriptionMultiple(24.6), "24.6x");
  assert.equal(formatSubscriptionMultiple(12.5), "12.5x");
  assert.equal(formatSubscriptionMultiple(0.8), "0.8x");
  assert.equal(formatSubscriptionMultiple(0), "0x");
  assert.equal(formatSubscriptionMultiple(null), "Unavailable");
  assert.equal(formatPriceBand(650, 675), "₹650–₹675");
  assert.equal(formatPriceBand(0, 0), "₹0–₹0");
  assert.equal(formatPriceBand(650, null), "Unavailable");
});

test("formats timestamps in Asia/Kolkata", () => {
  const value = new Date("2026-10-18T06:00:00.000Z");
  assert.equal(formatIstDateTime(value), "18 Oct 2026, 11:30 AM IST");
  assert.equal(formatLastUpdated(value), "Last updated: 18 Oct 2026, 11:30 AM IST");
  assert.equal(formatIstDate("2026-10-18"), "18 Oct 2026");
  assert.equal(formatIstDate("2026-02-31"), "Unavailable");
});

test("GMP history clocks convert from Asia/Kolkata once", () => {
  const recorded = istCivilDateTime("2026-08-31 10:48:02");
  assert.equal(recorded?.toISOString(), "2026-08-31T05:18:02.000Z");
  assert.equal(formatIstDateTime(recorded), "31 Aug 2026, 10:48 AM IST");
  assert.equal(istCalendarDate(recorded), "2026-08-31");
  const anchor = istDateAnchor("2026-08-31");
  assert.equal(anchor?.toISOString(), "2026-08-30T18:30:00.000Z");
  assert.equal(istCalendarDate(anchor), "2026-08-31");
  assert.equal(formatIstDate("2026-08-31"), "31 Aug 2026");
  assert.equal(istCivilDateTime("2026-08-31 25:00:00"), null);
  assert.equal(istCivilDateTime("2026-08-31T10:48:02Z"), null);
  assert.equal(istDateAnchor("2026-02-31"), null);
});

test("missing timestamps are not formatted as the unix epoch", () => {
  assert.equal(formatIstDateTime(null), "Unavailable");
  assert.equal(formatIstDateTime(undefined), "Unavailable");
  assert.equal(formatIstDateTime(new Date("invalid")), "Unavailable");
  assert.equal(formatLastUpdated(null), "Last updated: Unavailable");
});

test("freshness distinguishes missing, fresh, and stale", () => {
  assert.equal(resolveFreshness(null, now, fifteenMinutes), "missing");
  assert.equal(resolveFreshness(new Date("invalid"), now, fifteenMinutes), "missing");
  assert.equal(resolveFreshness(new Date("2026-10-18T05:50:00.000Z"), now, fifteenMinutes), "fresh");
  assert.equal(resolveFreshness(new Date("2026-10-17T06:00:00.000Z"), now, fifteenMinutes), "stale");
  assert.equal(resolveFreshness(new Date(0), now, fifteenMinutes), "stale");
});

test("freshness labels are words, not color names", () => {
  assert.equal(freshnessLabel("fresh"), "Fresh");
  assert.equal(freshnessLabel("stale"), "Delayed");
  assert.equal(freshnessLabel("missing"), "Updated time unavailable");
});
