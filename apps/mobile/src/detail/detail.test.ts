import assert from "node:assert/strict";
import test from "node:test";
import { ipoSchema, type Ipo } from "@ipo-singh/contracts";
import { actualListingGainPercent, formatInr, formatSignedPercent, formatSubscriptionMultiple, unofficialGmpDisclaimer } from "@ipo-singh/core";
import { listingLifecycleLabel } from "../design/copy.ts";
import { primaryTabTitles } from "../design/tabs.ts";
import { issueRoute } from "../catalogue/routes.ts";
import { allotmentLink, documentLink, publicIpoPage } from "./links.ts";
import {
  allotmentModel,
  anchorModel,
  documentModel,
  financialModel,
  gmpModel,
  listingModel,
  overviewModel,
  profileModel,
  subscriptionModel,
} from "./model.ts";
import { detailSections } from "./sections.ts";

const provenance = { sourceName: "IPO Singh", retrievedAt: "2026-10-25T12:00:00.000Z", freshness: "fresh" as const };

function storedIpo(patch: Partial<Ipo> = {}): Ipo {
  return ipoSchema.parse({
    id: "fixture-polymers",
    slug: "fixture-polymers",
    companyName: "Fixture Polymers",
    board: "mainboard",
    status: "listed",
    offer: {
      priceBand: { lowRupees: 100, highRupees: 110 },
      issuePriceRupees: 100,
      issueSizeRupees: 0,
      lotSizeShares: 10,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: "2026-10-20", closeDate: "2026-10-22", allotmentDate: "2026-10-24", listingDate: "2026-10-27" },
    gmp: { amountRupees: 0, percent: 0, indicativeImpliedPriceRupees: null, observedAt: "2026-10-25T09:00:00.000Z", freshness: "stale" },
    subscription: {
      retailTimes: 0,
      qibTimes: null,
      niiTimes: 2,
      employeeTimes: null,
      totalTimes: 0,
      observedAt: null,
      freshness: "fresh",
      categories: [{ key: "NII", times: 2, subcategories: [{ key: "SNII", times: 0 }] }],
    },
    financials: [{ fiscalYearLabel: "FY2025", revenueRupees: null, profitAfterTaxRupees: 0, earningsPerShareRupees: null }],
    registrar: { name: "Bigshare Services", websiteUrl: "https://www.bigshareonline.com/", allotmentUrl: "https://ipo.bigshareonline.com/ipo_status.html" },
    documents: [
      { kind: "rhp", title: "Red herring prospectus", url: "https://example.com/rhp.pdf", publishedOn: null },
      { kind: "drhp", title: "Blocked", url: "https://user:secret@example.com/secret.pdf", publishedOn: null },
    ],
    listing: { issuePriceRupees: 100, listingPriceRupees: 125, gainPercent: null, listedOn: "2026-10-27" },
    profile: {
      refundDate: null,
      dematCreditDate: null,
      about: "Stored company profile.",
      description: null,
      strengths: ["Stored strength"],
      risks: ["Stored risk"],
      promoters: [{ name: "Fixture Promoter", profile: "Founder" }],
      objectsOfIssue: { items: ["Working capital"], text: null },
      sourceFinancials: { unit: "₹ crore", headers: ["FY2025"], rows: [{ metric: "Total assets", values: ["1,508.24"] }], text: null },
      cmpRupees: null,
      currentGainPercent: null,
      anchors: {
        totalCount: 1,
        totalAmountCrore: 10,
        mutualFundCount: 0,
        investors: [
          {
            name: "Anchor Fund",
            group: "Mutual fund",
            shares: 1000,
            amountCrore: 10,
            allocatedPercent: 5,
            issuePercent: 1,
          },
        ],
      },
    },
    provenance,
    ...patch,
  });
}

test("detail sections stay on the page and out of the primary tabs", () => {
  assert.deepEqual(
    detailSections.map((section) => section.id),
    ["overview", "gmp", "subscription", "financials", "allotment", "listing", "documents"],
  );
  assert.equal(primaryTabTitles().includes("GMP"), false);
  assert.equal(primaryTabTitles().includes("Subscription"), false);
});

test("share links use the public website page", () => {
  assert.equal(publicIpoPage("https://ipo.example", "fixture-polymers", "production").url, "https://ipo.example/ipos/fixture-polymers");
  assert.equal(publicIpoPage(undefined, "fixture-polymers", "development").url, null);
  assert.equal(publicIpoPage("https://www.ipoguru.in", "fixture-polymers", "production").url, null);
  assert.equal(publicIpoPage("https://user:secret@ipo.example", "fixture-polymers", "production").url, null);
  assert.equal(publicIpoPage("http://127.0.0.1:3000", "fixture-polymers", "production").url, null);
  assert.equal(publicIpoPage("https://ipo.example", "Fixture", "production").url, null);
  const shared = publicIpoPage("https://ipo.example", "fixture-polymers", "production");
  assert.equal(shared.url?.includes("/api/"), false);
});

test("allotment and documents open only safe addresses", () => {
  const ipo = storedIpo();
  assert.equal(allotmentLink(ipo.registrar), "https://ipo.bigshareonline.com/ipo_status.html");
  assert.equal(allotmentLink({ name: "KFin", allotmentUrl: "https://registrar.example/status" }), "https://ipostatus.kfintech.com/");
  assert.equal(allotmentLink({ name: "Unknown Registrar", allotmentUrl: "https://registrar.example/status" }), null);
  assert.equal(documentLink("javascript:alert(1)"), null);
  assert.equal(documentLink("https://user:secret@example.com/rhp.pdf"), null);
  const documents = documentModel(ipo, documentLink);
  assert.deepEqual(documents.map((item) => item.url), ["https://example.com/rhp.pdf"]);
});

test("open, upcoming, listed, allotment awaited, and allotment out stay distinct", () => {
  assert.equal(overviewModel(storedIpo({ status: "open", allotmentConfirmed: undefined })).statusLabel, "Open");
  assert.equal(overviewModel(storedIpo({ status: "upcoming" })).statusLabel, "Upcoming");
  assert.equal(overviewModel(storedIpo({ status: "listed", allotmentConfirmed: true })).statusLabel, "Listed");
  assert.equal(listingLifecycleLabel({ status: "listed", allotmentConfirmed: true }), "Listed");
  assert.equal(overviewModel(storedIpo({ status: "closed", allotmentConfirmed: false })).statusLabel, "Allotment Awaited");
  assert.equal(overviewModel(storedIpo({ status: "allotment", allotmentConfirmed: false })).statusLabel, "Allotment Awaited");
  assert.equal(overviewModel(storedIpo({ status: "allotment", allotmentConfirmed: true })).statusLabel, "Allotment Out");
  assert.equal(allotmentModel(storedIpo({ status: "open", allotmentConfirmed: false })).status, "Allotment Awaited");
  assert.equal(allotmentModel(storedIpo({ allotmentConfirmed: true })).status, "Allotment Out");
  assert.equal(allotmentModel(storedIpo({ allotmentConfirmed: true })).confirmed, true);
});

test("notification deep links keep using the IPO id as the detail slug", () => {
  const route = issueRoute("fixture-polymers");
  assert.equal(route?.pathname, "/ipo/[slug]");
  assert.equal(route?.params.slug, "fixture-polymers");
});

test("GMP, subscription, financials, and listing keep missing distinct from zero", () => {
  const ipo = storedIpo();
  const gmp = gmpModel(ipo);
  assert.equal(gmp.amount, formatInr(0));
  assert.equal(gmp.percent, formatSignedPercent(0));
  assert.equal(gmp.disclaimer, unofficialGmpDisclaimer);
  assert.equal(gmp.freshness, "Delayed");
  assert.equal(gmp.missing, false);

  const missingGmp = gmpModel(storedIpo({ gmp: null }));
  assert.equal(missingGmp.amount, "GMP unavailable");
  assert.equal(missingGmp.disclaimer, null);
  assert.equal(missingGmp.missing, true);

  const subscription = subscriptionModel(ipo);
  assert.equal(subscription.total, formatSubscriptionMultiple(0));
  assert.equal(subscription.rows.find((row) => row.label === "QIB")?.value, "Unavailable");
  assert.equal(subscription.rows.find((row) => row.label === "NII / HNI")?.children[0]?.value, formatSubscriptionMultiple(0));
  assert.equal(subscriptionModel(storedIpo({ subscription: null })).rows.length, 0);

  const financials = financialModel(ipo);
  assert.equal(financials.periods[0]?.revenue, "Unavailable");
  assert.equal(financials.periods[0]?.profit, formatInr(0));
  assert.equal(financials.unit, "₹ crore");
  assert.equal(financials.rows[0]?.values[0], "1,508.24");
  assert.equal(financials.empty, false);
  assert.equal(financialModel(storedIpo({ financials: [], profile: null })).empty, true);

  const listing = listingModel(ipo);
  const gain = actualListingGainPercent({ listingPriceRupees: 125, issuePriceRupees: 100 });
  assert.equal(gain.status, "value");
  assert.equal(listing.find((fact) => fact.label === "Listing price")?.value, formatInr(125));
  assert.equal(listing.find((fact) => fact.label === "Listing gain or loss")?.value, gain.status === "value" ? formatSignedPercent(gain.value) : "");
  const blankListing = listingModel(storedIpo({ listing: null, offer: { ...ipo.offer, issuePriceRupees: null, priceBand: { lowRupees: null, highRupees: null } } }));
  assert.equal(blankListing.find((fact) => fact.label === "Listing price")?.value, "Unavailable");

  const overview = overviewModel(ipo);
  assert.equal(overview.facts.find((fact) => fact.label === "Issue size")?.value.includes("0"), true);
  assert.equal(overview.facts.find((fact) => fact.label === "Registrar")?.value, "Bigshare Services");
  assert.equal(overview.facts.find((fact) => fact.label === "Exchange")?.value, "Unavailable");
  assert.equal(overview.about, "Stored company profile.");

  const profile = profileModel(ipo);
  assert.deepEqual(profile.strengths, ["Stored strength"]);
  assert.deepEqual(profile.risks, ["Stored risk"]);
  assert.equal(profile.promoters[0]?.name, "Fixture Promoter");
  assert.deepEqual(profile.objects?.items, ["Working capital"]);

  const anchors = anchorModel(ipo);
  assert.equal(anchors.investors[0]?.name, "Anchor Fund");
  assert.equal(anchors.summary.find((fact) => fact.label === "Total amount")?.value, "₹10 crore");
  assert.equal(anchorModel(storedIpo({ profile: null })).investors.length, 0);
});
