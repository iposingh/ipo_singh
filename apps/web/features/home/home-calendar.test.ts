import assert from "node:assert/strict";
import test from "node:test";
import { currentMonth, monthBounds } from "../calendar/month.ts";
import { loadCalendarCatalog } from "../../lib/api/ipo-singh.ts";

test("homepage calendar preview bounds to the current India month", async () => {
  const now = new Date("2026-11-05T06:30:00.000Z"); // 12:00 IST on 5 Nov 2026
  const month = currentMonth(now);
  assert.equal(month, "2026-11");
  const bounds = monthBounds(month!);
  assert.deepEqual(bounds, { from: "2026-11-01", to: "2026-11-30", label: "November 2026" });

  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    return Response.json({
      items: [
        {
          date: "2026-11-03",
          event: "listing",
          ipo: {
            id: "alpha",
            slug: "alpha",
            companyName: "Alpha",
            board: "mainboard",
            status: "listed",
            openDate: "2026-10-20",
            closeDate: "2026-10-22",
            gmpAmountRupees: null,
            subscriptionTotalTimes: null,
            provenance: { sourceName: "IPO Singh", retrievedAt: null, freshness: "missing" },
          },
        },
        {
          date: "2026-10-15",
          event: "open",
          ipo: {
            id: "old",
            slug: "old",
            companyName: "Old",
            board: "sme",
            status: "closed",
            openDate: "2026-10-15",
            closeDate: "2026-10-17",
            gmpAmountRupees: null,
            subscriptionTotalTimes: null,
            provenance: { sourceName: "IPO Singh", retrievedAt: null, freshness: "missing" },
          },
        },
      ],
      page: { limit: 100, nextCursor: null, totalCount: 2 },
    });
  };

  const loaded = await loadCalendarCatalog(
    { origin: "http://127.0.0.1:4000", fetch: fetchImpl },
    { from: bounds!.from, to: bounds!.to },
  );
  assert.equal(loaded.status, "ready");
  assert.equal(urls.length, 1);
  assert.equal(urls[0]?.includes("from=2026-11-01"), true);
  assert.equal(urls[0]?.includes("to=2026-11-30"), true);
  assert.equal(urls[0]?.includes("cursor="), false);
});

test("month-scoped calendar stops after one page when the cursor is absent", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json({
      items: Array.from({ length: 6 }, (_item, index) => ({
        date: `2026-11-${String(index + 1).padStart(2, "0")}`,
        event: "open",
        ipo: {
          id: `ipo-${index}`,
          slug: `ipo-${index}`,
          companyName: `IPO ${index}`,
          board: index % 2 === 0 ? "mainboard" : "sme",
          status: "open",
          openDate: `2026-11-${String(index + 1).padStart(2, "0")}`,
          closeDate: null,
          gmpAmountRupees: null,
          subscriptionTotalTimes: null,
          provenance: { sourceName: "IPO Singh", retrievedAt: null, freshness: "missing" },
        },
      })),
      page: { limit: 100, nextCursor: null, totalCount: 6 },
    });
  };
  const loaded = await loadCalendarCatalog(
    { origin: "http://127.0.0.1:4000", fetch: fetchImpl },
    { from: "2026-11-01", to: "2026-11-30" },
  );
  assert.equal(loaded.status, "ready");
  if (loaded.status === "ready") {
    assert.equal(loaded.entries.length, 6);
    assert.equal(loaded.truncated, false);
  }
  assert.equal(calls, 1);
});
