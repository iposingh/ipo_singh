import type {
  FinancialPeriod,
  GmpHistory,
  GmpSnapshot,
  Ipo,
  IpoSummary,
  ListingPerformance,
  Registrar,
  SubscriptionHistory,
  SubscriptionSnapshot,
} from "@ipo-singh/contracts";
import type { ProviderSource } from "../provider.ts";

export const fixtureSourceName = "Fixture provider";
export const fixtureIpoId = "fixture-polymers";

export function fixtureSource(now: Date): ProviderSource {
  const stamp = now.toISOString();
  return { sourceName: fixtureSourceName, retrievedAt: stamp, sourceUpdatedAt: stamp };
}

export function fixtureGmp(now: Date, amountRupees: number | null = 0): GmpSnapshot {
  return {
    amountRupees,
    percent: amountRupees === null ? null : 0,
    indicativeImpliedPriceRupees: amountRupees,
    observedAt: now.toISOString(),
    freshness: "fresh",
  };
}

export function fixtureSubscription(now: Date): SubscriptionSnapshot {
  return {
    retailTimes: 0,
    qibTimes: null,
    niiTimes: null,
    employeeTimes: null,
    totalTimes: 0,
    observedAt: now.toISOString(),
    freshness: "fresh",
  };
}

export function fixtureSummary(now: Date): IpoSummary {
  const source = fixtureSource(now);
  return {
    id: fixtureIpoId,
    slug: fixtureIpoId,
    companyName: "Fixture Polymers",
    board: "mainboard",
    status: null,
    openDate: null,
    closeDate: null,
    gmpAmountRupees: 0,
    subscriptionTotalTimes: null,
    provenance: {
      sourceName: source.sourceName,
      retrievedAt: source.retrievedAt,
      freshness: "fresh",
    },
  };
}

export function fixtureIpo(now: Date): Ipo {
  const summary = fixtureSummary(now);
  return {
    id: summary.id,
    slug: summary.slug,
    companyName: summary.companyName,
    board: summary.board,
    status: null,
    offer: {
      priceBand: { lowRupees: null, highRupees: null },
      issuePriceRupees: 0,
      issueSizeRupees: null,
      lotSizeShares: 0,
      minimumInvestmentRupees: 0,
    },
    dates: { openDate: null, closeDate: null, allotmentDate: null, listingDate: null },
    gmp: fixtureGmp(now),
    subscription: null,
    financials: fixtureFinancials(),
    registrar: fixtureRegistrar(),
    documents: [],
    listing: fixtureListing(),
    provenance: summary.provenance,
  };
}

export function fixtureGmpHistory(now: Date): GmpHistory {
  return {
    ipoId: fixtureIpoId,
    observations: [
      {
        observedAt: now.toISOString(),
        amountRupees: 0,
        percent: 0,
        session: "daily",
      },
    ],
  };
}

export function fixtureSubscriptionHistory(now: Date): SubscriptionHistory {
  return { ipoId: fixtureIpoId, observations: [fixtureSubscription(now)] };
}

export function fixtureFinancials(): FinancialPeriod[] {
  return [
    {
      fiscalYearLabel: "FY26",
      revenueRupees: null,
      profitAfterTaxRupees: 0,
      earningsPerShareRupees: null,
    },
  ];
}

export function fixtureRegistrar(): Registrar {
  return {
    name: "Fixture Registrar",
    websiteUrl: "https://example.com/registrar",
    allotmentUrl: "https://example.com/allotment",
  };
}

export function fixtureListing(): ListingPerformance {
  return {
    issuePriceRupees: 0,
    listingPriceRupees: null,
    gainPercent: null,
    listedOn: null,
  };
}
