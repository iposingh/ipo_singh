import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorSchema, ipoListQuerySchema, pageSchema, searchQuerySchema } from "./api.ts";
import { gmpHistorySchema, indicativeGmpDisclaimer } from "./gmp.ts";
import { ipoSchema, ipoSummarySchema } from "./ipo.ts";
import { isIsoDate } from "./primitives.ts";
import { subscriptionSnapshotSchema } from "./subscription.ts";

const provenance = {
  sourceName: "not-connected",
  retrievedAt: null,
  freshness: "missing" as const,
};

const ipo = {
  id: "sample-forge",
  slug: "sample-forge",
  companyName: "Sample Forge Ltd",
  board: "mainboard" as const,
  status: null,
  offer: {
    priceBand: { lowRupees: 0, highRupees: 100 },
    issuePriceRupees: null,
    issueSizeRupees: null,
    lotSizeShares: 0,
    minimumInvestmentRupees: 0,
  },
  dates: {
    openDate: "2026-10-18",
    closeDate: null,
    allotmentDate: null,
    listingDate: null,
  },
  gmp: {
    amountRupees: 0,
    percent: 0,
    indicativeImpliedPriceRupees: null,
    observedAt: null,
    freshness: "stale" as const,
  },
  subscription: {
    retailTimes: 0,
    qibTimes: null,
    niiTimes: null,
    employeeTimes: null,
    totalTimes: 0,
    observedAt: null,
    freshness: "fresh" as const,
  },
  financials: [
    {
      fiscalYearLabel: "FY2025",
      revenueRupees: null,
      profitAfterTaxRupees: -100,
      earningsPerShareRupees: null,
    },
  ],
  registrar: {
    name: "Sample Registrar",
    websiteUrl: null,
    allotmentUrl: "https://example.com/allotment",
  },
  documents: [
    {
      kind: "drhp" as const,
      title: "Draft red herring prospectus",
      url: "https://example.com/drhp.pdf",
      publishedOn: null,
    },
  ],
  listing: null,
  provenance,
};

test("an IPO can carry zeros without treating them as missing", () => {
  const parsed = ipoSchema.parse(ipo);
  assert.equal(parsed.offer.priceBand.lowRupees, 0);
  assert.equal(parsed.offer.lotSizeShares, 0);
  assert.equal(parsed.gmp?.amountRupees, 0);
  assert.equal(parsed.subscription?.retailTimes, 0);
  assert.equal(parsed.offer.issueSizeRupees, null);
  assert.equal(parsed.subscription?.qibTimes, null);
});

test("provider-specific fields are rejected", () => {
  const withProviderId = { ...ipo, guruIssueId: "secret-provider-id" };
  assert.equal(ipoSchema.safeParse(withProviderId).success, false);
});

test("impossible dates, negative lots, and negative subscription times are rejected", () => {
  assert.equal(isIsoDate("2026-02-31"), false);
  assert.equal(
    ipoSchema.safeParse({ ...ipo, dates: { ...ipo.dates, openDate: "2026-02-31" } }).success,
    false,
  );
  assert.equal(
    ipoSchema.safeParse({
      ...ipo,
      offer: { ...ipo.offer, lotSizeShares: -1 },
    }).success,
    false,
  );
  assert.equal(
    ipoSchema.safeParse({
      ...ipo,
      subscription: { ...ipo.subscription, totalTimes: -2 },
    }).success,
    false,
  );
  const withCategories = subscriptionSnapshotSchema.parse({
    ...ipo.subscription,
    shareholderTimes: 0,
    anchorTimes: null,
    observedOn: "2026-09-01",
    categories: [
      {
        key: "NII",
        times: 4.5,
        subcategories: [
          { key: "BNII", times: 3 },
          { key: "SNII", times: null },
        ],
      },
    ],
  });
  assert.equal(withCategories.categories?.[0]?.subcategories[0]?.key, "BNII");
  assert.equal(withCategories.categories?.[0]?.subcategories[1]?.times, null);
  assert.equal(subscriptionSnapshotSchema.safeParse({ ...ipo.subscription, categories: [{ key: "nii", times: 1, subcategories: [] }] }).success, false);
});

test("GMP history keeps daily and intraday observations, including a negative premium", () => {
  const history = gmpHistorySchema.parse({
    ipoId: "sample-forge",
    observations: [
      {
        observedAt: "2026-08-31T05:18:02.000Z",
        observedOn: "2026-08-31",
        amountRupees: -15,
        percent: 0,
        session: "intraday",
        slotLabel: "11 AM",
      },
    ],
    window: {
      high: { amountRupees: 0, observedOn: "2026-08-29" },
      low: { amountRupees: -15, observedOn: "2026-08-31" },
      truncated: true,
      timelineLocked: false,
    },
  });
  assert.equal(history.observations[0]?.amountRupees, -15);
  assert.equal(history.observations[0]?.percent, 0);
  assert.equal(history.observations[0]?.slotLabel, "11 AM");
  assert.equal(history.window?.truncated, true);
  assert.match(indicativeGmpDisclaimer, /not a guaranteed listing price/);
});

test("list queries, pages, and errors stay free of provider payloads", () => {
  const query = ipoListQuerySchema.parse({ board: "sme", status: "open", limit: 20, sort: "close", direction: "desc" });
  assert.equal(query.board, "sme");
  assert.equal(query.sort, "close");
  assert.equal(searchQuerySchema.safeParse({}).success, false);
  assert.equal(ipoListQuerySchema.safeParse({ board: "sme", apiKey: "nope" }).success, false);

  const page = pageSchema(ipoSummarySchema).parse({
    items: [],
    page: { limit: 20, nextCursor: null, totalCount: 0 },
  });
  assert.equal(page.page.totalCount, 0);

  const unknownTotal = pageSchema(ipoSummarySchema).parse({
    items: [],
    page: { limit: 20, nextCursor: null, totalCount: null },
  });
  assert.equal(unknownTotal.page.totalCount, null);

  const error = apiErrorSchema.parse({
    code: "unavailable",
    message: "IPO data is not connected.",
  });
  assert.equal(error.code, "unavailable");
  assert.equal(apiErrorSchema.safeParse({ code: "unavailable", message: "x", rawProviderBody: {} }).success, false);
});
