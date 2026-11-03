import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapUnlistedShare } from "./unlisted.ts";

describe("IPO Guru unlisted shares", () => {
  it("keeps an indicative dealer quote separate from an exchange price", () => {
    const share = mapUnlistedShare({
      slug: "sample-pre-ipo",
      name: "Sample Pre IPO",
      display_name: "Sample",
      isin: "INE000000000",
      sector: "Software",
      price_type: "indicative_dealer_quote",
      price_source: "unlistedzone",
      is_stale: false,
      ltp: 250,
      price_date: "2026-10-27",
      ltp_updated_at: "2026-10-27T15:30:00.000Z",
      lot_size: 10,
      dealer_range: { low: 240, high: 260, median: 250 },
    });
    assert.ok(share);
    assert.equal(share.quoteKind, "indicative_dealer_quote");
    assert.equal(share.quote.priceRupees, 250);
    assert.equal(share.quote.priceDate, "2026-10-27");
    assert.equal(share.quote.observedAt, "2026-10-27T15:30:00.000Z");
    assert.equal(share.priceSource, "unlistedzone");
    assert.equal(mapUnlistedShare({ ...share, slug: "sample-pre-ipo", name: "Sample Pre IPO", price_type: "exchange_ltp" }), null);
  });

  it("reads the detail price block and keeps history timestamps", () => {
    const share = mapUnlistedShare({
      slug: "sample-pre-ipo",
      name: "Sample Pre IPO",
      price: {
        price_type: "indicative_dealer_quote",
        price_source: "manual",
        ltp: 10,
        price_date: "2026-10-20",
        updated_at: "2026-10-20T03:30:00.000Z",
        is_stale: true,
        face_value: "10",
        dealer_range: { low: 9, high: 11, median: 10 },
      },
      price_history: [{ date: "2026-10-20T03:30:00.000Z", price: 10, note: null }],
    });
    assert.equal(share?.quote.isStale, true);
    assert.equal(share?.quote.faceValueText, "10");
    assert.equal(share?.history[0]?.observedAt, "2026-10-20T03:30:00.000Z");
    assert.equal(share?.history[0]?.priceRupees, 10);
  });
});
