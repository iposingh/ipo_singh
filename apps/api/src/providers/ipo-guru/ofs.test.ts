import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapOfsIssue, mapOfsList } from "./ofs.ts";

describe("IPO Guru OFS", () => {
  it("keeps an offer for sale out of the IPO board classification", () => {
    const issue = mapOfsIssue({
      slug: "sample-retail-sep-2026",
      company: "Sample Company",
      short_name: "Sample",
      category: "Retail",
      status: "closed",
      open_date: "2026-09-01T03:45:00.000Z",
      close_date: "2026-09-01T10:00:00.000Z",
      floor_price: 100,
      discount: 0,
      nse_symbol: "SAMPLE",
      bse_scripcode: "500000",
      subscription: 1.2,
      seller: "Sample Seller",
      shares_offered: 1000,
      green_shoe_size: null,
      book: {
        offer_date: "01-Sep-2026",
        data_timestamp: "2026-09-01T10:00:00.000Z",
        floor_price: 100,
        indicative_price: 101,
        ltp: 102,
        subscription_times: 1.2,
        total_qty: 500,
        status: "closed",
      },
    });
    assert.ok(issue);
    assert.equal(issue.category, "retail");
    assert.equal(issue.floorPriceRupees, 100);
    assert.equal(issue.subscriptionTimes, 1.2);
    assert.equal(issue.book?.offerDateText, "01-Sep-2026");
    assert.equal(issue.book?.observedAt, "2026-09-01T10:00:00.000Z");
    assert.equal("board" in issue, false);
    assert.equal(mapOfsList([issue && { slug: "bad slug", company: "Nope" }]).length, 0);
  });
});
