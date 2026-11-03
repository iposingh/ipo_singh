import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { provenanceFor } from "../normalize.ts";
import { ProviderNotConnectedError } from "../errors.ts";
import { validationFailureCount } from "../../ops/validation.ts";
import { createIpoGuruProvider } from "./adapter.ts";
import { mapIpoCatalog } from "./catalog.ts";

const observedAt = "2026-09-22T07:06:09.000Z";
const now = new Date(observedAt);

function provenance() {
  return provenanceFor(
    { sourceName: "IPO Guru Pro", retrievedAt: observedAt, sourceUpdatedAt: null },
    now,
  );
}

function varmora(overrides: Record<string, unknown> = {}) {
  return {
    slug: "varmora-granito-ipo",
    name: "Varmora Granito",
    display_name: "Varmora Granito",
    type: "Mainboard",
    sub_type: "Equity",
    status: "Open",
    is_listed: false,
    open_date: "2026-09-22",
    close_date: "2026-09-24",
    allotment_date: "2026-09-25",
    listing_date: "2026-09-29",
    price_band: "140-148",
    price_min: 140,
    price_max: 148,
    issue_price: "148",
    issue_size: "708.02",
    lot_size: 101,
    min_investment: 14948,
    gmp: {
      price: "7.5",
      percentage: "5.07",
      kostak: null,
      subject_to_sauda: "700,,9800",
      estimated_listing_price: 155.5,
      updated_at: "2026-09-22T07:06:09.000000Z",
      updated_at_label: "22 Sep 2026, 12:36 PM IST",
    },
    subscription_total: "0.07",
    listing_price: null,
    listing_gain_percent: null,
    cmp: null,
    web_url: "https://www.ipoguru.in/ipo/varmora-granito-ipo",
    ...overrides,
  };
}

describe("IPO Guru catalogue mapping", () => {
  it("maps the documented list item and keeps null distinct from zero", () => {
    const mapped = mapIpoCatalog(
      [
        varmora(),
        {
          slug: "nil-gmp-ipo",
          name: "Nil Premium",
          type: "SME",
          status: "Upcoming",
          is_listed: false,
          open_date: null,
          close_date: null,
          allotment_date: null,
          listing_date: null,
          price_min: null,
          price_max: null,
          issue_price: null,
          issue_size: null,
          lot_size: null,
          min_investment: null,
          gmp: { price: "0", percentage: null, estimated_listing_price: null, updated_at: observedAt },
          subscription_total: "0",
        },
        {
          slug: "blank-gmp-ipo",
          name: "Blank Premium",
          type: "SME",
          status: "Upcoming",
          is_listed: false,
          price_min: null,
          price_max: 10,
          issue_price: "",
          issue_size: "",
          lot_size: null,
          gmp: null,
          subscription_total: "",
        },
      ],
      now,
      provenance(),
    );
    const main = mapped.issues[0];
    assert.equal(main?.board, "mainboard");
    assert.equal(main?.status, "open");
    assert.equal(main?.id, "varmora-granito-ipo");
    assert.equal(main?.offer.priceBand.lowRupees, 140);
    assert.equal(main?.offer.priceBand.highRupees, 148);
    assert.equal(main?.offer.issuePriceRupees, 148);
    assert.equal(main?.offer.issueSizeRupees, 7_080_200_000);
    assert.equal(main?.offer.lotSizeShares, 101);
    assert.equal(main?.gmp?.amountRupees, 7.5);
    assert.equal(main?.gmp?.percent, 5.07);
    assert.equal(main?.gmp?.indicativeImpliedPriceRupees, 155.5);
    assert.equal(main?.gmp?.observedAt, observedAt);
    assert.equal(main?.subscription?.totalTimes, 0.07);
    assert.equal(main?.subscription?.retailTimes, null);
    assert.equal(main?.listing?.listingPriceRupees, null);
    assert.equal(mapped.issues[1]?.gmp?.amountRupees, 0);
    assert.equal(mapped.issues[1]?.subscription?.totalTimes, 0);
    assert.equal(mapped.issues[2]?.gmp, null);
    assert.equal(mapped.issues[2]?.subscription, null);
    assert.equal(mapped.issues[2]?.offer.issuePriceRupees, null);
    assert.equal(mapped.issues[2]?.offer.issueSizeRupees, null);
    assert.equal(mapped.summaries[0]?.gmpAmountRupees, 7.5);
  });

  it("separates boards, derives allotment, and does not guess a missing board", () => {
    const before = validationFailureCount();
    const mapped = mapIpoCatalog(
      [
        varmora({ status: "Closed", is_listed: false }),
        varmora({ slug: "listed-mills-ipo", name: "Listed Mills", status: "Closed", is_listed: true }),
        varmora({
          slug: "pre-rhp-ipo",
          name: "Pre RHP Mills",
          type: "Mainboard",
          stage: "pre_rhp",
          dates_tba: true,
          status: "Upcoming",
          open_date: "2026-01-01",
          price_min: 10,
          lot_size: 50,
        }),
        { slug: "unknown-board-ipo", name: "SME Sounding Name", type: "Debt", status: "Open" },
        { slug: "missing-board-ipo", name: "Missing Board", status: "Open" },
        { slug: "sample-ofs", name: "Sample OFS Co", type: "OFS", status: "Open" },
        { slug: "sample-unlisted", name: "Sample Unlisted", type: "Unlisted", status: "Open" },
        varmora(),
      ],
      new Date("2026-09-26T04:00:00.000Z"),
      provenance(),
    );
    assert.deepEqual(
      mapped.issues.map((issue) => [issue.slug, issue.board, issue.status]),
      [
        ["varmora-granito-ipo", "mainboard", "allotment"],
        ["listed-mills-ipo", "mainboard", "listed"],
        ["pre-rhp-ipo", "mainboard", "upcoming"],
      ],
    );
    assert.equal(
      mapped.issues.some((issue) => issue.slug === "sample-ofs" || issue.slug === "sample-unlisted"),
      false,
    );
    assert.equal(mapped.issues[2]?.dates.openDate, null);
    assert.equal(mapped.issues[2]?.offer.priceBand.lowRupees, null);
    assert.equal(mapped.issues[2]?.offer.lotSizeShares, null);
    assert.ok(validationFailureCount() > before);
  });

  it("stays disconnected until a client is supplied", async () => {
    const provider = createIpoGuruProvider();
    assert.equal(provider.capabilities.listIpos, "unverified");
    assert.equal(provider.capabilities.ipoDetails, "unverified");
    await assert.rejects(() => provider.listIpos({}), ProviderNotConnectedError);
    await assert.rejects(() => provider.getCurrentGmp("varmora-granito-ipo"), ProviderNotConnectedError);
  });
});
