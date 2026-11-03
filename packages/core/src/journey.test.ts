import assert from "node:assert/strict";
import test from "node:test";
import { ipoCardStage, ipoJourney } from "./journey.ts";

const dates = {
  openDate: "2026-10-26",
  closeDate: "2026-10-28",
  allotmentDate: "2026-10-29",
  listingDate: "2026-11-02",
};

test("a passed allotment date does not complete allotment or mark the card as out", () => {
  const journey = ipoJourney({ status: "allotment", ...dates, allotmentConfirmed: false });
  assert.equal(journey.find((item) => item.id === "allotment")?.state, "current");
  assert.equal(journey.find((item) => item.id === "allotment")?.note, "Expected");
  assert.equal(journey.find((item) => item.id === "listing")?.state, "upcoming");
  assert.equal(ipoCardStage({ status: "allotment", closeDate: dates.closeDate, today: "2026-10-30" }), "allotment-awaited");
  assert.equal(
    ipoCardStage({ status: "allotment", closeDate: dates.closeDate, today: "2026-10-30", allotmentConfirmed: true }),
    "allotment-out",
  );
});

test("listing status completes earlier milestones without using the calendar alone", () => {
  const journey = ipoJourney({ status: "listed", ...dates });
  assert.deepEqual(
    journey.map((item) => item.state),
    ["complete", "complete", "complete", "complete"],
  );
});

test("an upcoming issue stays scheduled when its open date has passed", () => {
  const journey = ipoJourney({ status: "upcoming", ...dates });
  assert.equal(journey[0]?.state, "current");
  assert.equal(journey[1]?.state, "upcoming");
});

test("last day is the close date while bidding is still open", () => {
  assert.equal(ipoCardStage({ status: "open", closeDate: "2026-10-28", today: "2026-10-28" }), "last-day");
  assert.equal(ipoCardStage({ status: "open", closeDate: "2026-10-29", today: "2026-10-28" }), "open");
  assert.equal(ipoCardStage({ status: "closed", closeDate: "2026-10-28", today: "2026-10-28" }), "allotment-awaited");
  assert.equal(ipoCardStage({ status: "open", closeDate: null, today: "2026-10-28" }), "open");
});

test("a missing date stays unavailable instead of being invented", () => {
  const journey = ipoJourney({
    status: "open",
    openDate: "2026-10-26",
    closeDate: "2026-10-28",
    allotmentDate: null,
    listingDate: null,
  });
  assert.equal(journey.find((item) => item.id === "allotment")?.state, "unavailable");
  assert.equal(journey.find((item) => item.id === "listing")?.state, "unavailable");
});
