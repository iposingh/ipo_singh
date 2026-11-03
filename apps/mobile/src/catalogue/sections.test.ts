import assert from "node:assert/strict";
import test from "node:test";
import { listingRequestPath, listingSections } from "./sections.ts";

test("mainboard and SME sections use separate status filters", () => {
  const mainboard = listingSections("mainboard");
  const sme = listingSections("sme");
  assert.deepEqual(mainboard.map((section) => section.title), [
    "Open IPOs",
    "Upcoming IPOs",
    "Allotment Awaited / Allotment Out",
    "Recently Listed IPOs",
  ]);
  assert.deepEqual(mainboard.map((section) => section.id), ["open", "upcoming", "allotment", "listed"]);
  assert.equal(listingRequestPath("mainboard", mainboard[0]!), "/api/v1/ipos?board=mainboard&status=open&sort=close&direction=asc&limit=20");
  assert.equal(listingRequestPath("mainboard", mainboard[1]!), "/api/v1/ipos?board=mainboard&status=upcoming&sort=open&direction=asc&limit=20");
  assert.equal(listingRequestPath("mainboard", mainboard[2]!), "/api/v1/ipos?board=mainboard&status=closed&sort=close&direction=desc&limit=20");
  assert.equal(listingRequestPath("sme", sme[3]!), "/api/v1/ipos?board=sme&status=listed&sort=listing&direction=desc&limit=20");
  assert.equal(listingRequestPath("mainboard", mainboard[0]!) === listingRequestPath("sme", sme[0]!), false);
  assert.equal(mainboard.some((section) => section.status === "allotment"), false);
  assert.equal(mainboard.find((section) => section.id === "allotment")?.status, "closed");
});
