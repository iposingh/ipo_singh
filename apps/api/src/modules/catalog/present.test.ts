import assert from "node:assert/strict";
import test from "node:test";
import type { Ipo } from "@ipo-singh/contracts";
import type { CompanyRecord, IpoRecord, RegistrarRecord, SourceDocumentRecord, SourceMetadataRecord } from "../../db/records.ts";
import { publicHttpUrl, publicPlainText } from "../../shared/public-text.ts";
import { registrarPayload, toDirectoryRow, toIpo } from "./present.ts";

const source: SourceMetadataRecord = {
  source: "fixture",
  fetchedAt: new Date("2026-10-18T04:30:00.000Z"),
  sourceUpdatedAt: null,
  freshness: "fresh",
};

test("public links accept only http addresses without credentials", () => {
  assert.equal(publicHttpUrl("https://registrar.example/status"), "https://registrar.example/status");
  assert.equal(publicHttpUrl("http://registrar.example/status"), "http://registrar.example/status");
  assert.equal(publicHttpUrl("javascript:alert(1)"), null);
  assert.equal(publicHttpUrl("https://user:secret@registrar.example/allotment"), null);
  assert.equal(publicPlainText("Fixture <b>Polymers</b>"), "Fixture Polymers");
  assert.equal(publicPlainText("<script>alert(1)</script>").includes("<"), false);
});

test("stored registrar markup and unsafe links are not served", () => {
  const company: CompanyRecord = {
    id: "fixture-polymers",
    name: "Fixture <b>Polymers</b>",
    symbol: null,
    source,
  };
  const record: IpoRecord = {
    id: "fixture-polymers",
    slug: "fixture-polymers",
    companyId: "fixture-polymers",
    board: "mainboard",
    status: "open",
    issue: {
      priceBandLowRupees: 100,
      priceBandHighRupees: 120,
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: 0,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: "2026-10-20", closeDate: "2026-10-22", allotmentDate: null, listingDate: null },
    listing: null,
    registrarId: "fixture-registrar",
    providerMappings: [],
    source,
  };
  const registrar: RegistrarRecord = {
    id: "fixture-registrar",
    name: "Fixture Registrar",
    websiteUrl: "javascript:alert(1)",
    allotmentUrl: "https://user:secret@registrar.example/allotment",
    source,
  };
  const documents: SourceDocumentRecord[] = [
    {
      ipoId: "fixture-polymers",
      kind: "drhp",
      title: "Draft <i>prospectus</i>",
      url: "https://registrar.example/drhp",
      publishedOn: null,
      source,
    },
    {
      ipoId: "fixture-polymers",
      kind: "source",
      title: "Unsafe",
      url: "javascript:alert(1)",
      publishedOn: null,
      source,
    },
  ];
  const ipo = toIpo({
    ipo: record,
    company,
    gmp: [],
    subscription: [],
    financials: [],
    registrar,
    documents,
  });
  const payload = registrarPayload(ipo, source);
  const serialized = JSON.stringify({ ipo, payload });
  assert.equal(ipo.companyName, "Fixture Polymers");
  assert.equal(ipo.registrar?.websiteUrl, null);
  assert.equal(ipo.registrar?.allotmentUrl, null);
  assert.equal(ipo.documents.length, 1);
  assert.equal(ipo.documents[0]?.title, "Draft prospectus");
  assert.equal(ipo.documents[0]?.url, "https://registrar.example/drhp");
  assert.equal(payload.verification, "verify-before-use");
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("javascript:"), false);
  assert.equal(serialized.includes("<script"), false);
});

test("directory summaries keep stored listing market fields without inventing zeros", () => {
  const base: Ipo = {
    id: "listed-mills",
    slug: "listed-mills",
    companyName: "Listed Mills",
    board: "mainboard",
    status: "listed",
    offer: {
      priceBand: { lowRupees: 90, highRupees: 100 },
      issuePriceRupees: 100,
      issueSizeRupees: null,
      lotSizeShares: null,
      minimumInvestmentRupees: null,
    },
    dates: { openDate: "2026-08-01", closeDate: "2026-08-04", allotmentDate: null, listingDate: "2026-08-10" },
    gmp: null,
    subscription: null,
    financials: [],
    registrar: null,
    documents: [],
    listing: { issuePriceRupees: 100, listingPriceRupees: 120, gainPercent: 20, listedOn: "2026-08-10" },
    profile: {
      refundDate: null,
      dematCreditDate: null,
      about: null,
      description: null,
      strengths: [],
      risks: [],
      promoters: [],
      objectsOfIssue: { items: [], text: null },
      sourceFinancials: { unit: null, headers: [], rows: [], text: null },
      cmpRupees: 130,
      currentGainPercent: 8.33,
    },
    provenance: { sourceName: "IPO Singh", retrievedAt: null, freshness: "missing" },
  };

  const ready = toDirectoryRow(base, "LISTED");
  assert.equal(ready.summary.listingPriceRupees, 120);
  assert.equal(ready.summary.listingIssuePriceRupees, 100);
  assert.equal(ready.summary.listingGainPercent, 20);
  assert.equal(ready.summary.cmpRupees, 130);
  assert.equal(ready.summary.currentGainPercent, 8.33);

  const missing = toDirectoryRow(
    {
      ...base,
      id: "missing-mills",
      slug: "missing-mills",
      board: "sme",
      listing: { issuePriceRupees: 0, listingPriceRupees: 10, gainPercent: 4.5, listedOn: "2026-08-10" },
      profile: {
        ...base.profile!,
        cmpRupees: null,
        currentGainPercent: null,
      },
    },
    null,
  );
  assert.equal(missing.summary.board, "sme");
  assert.equal(missing.summary.listingGainPercent, 4.5);
  assert.equal(missing.summary.cmpRupees, null);
  assert.equal(missing.summary.currentGainPercent, null);

  const zero = toDirectoryRow(
    {
      ...base,
      id: "zero-mills",
      slug: "zero-mills",
      listing: { issuePriceRupees: 80, listingPriceRupees: 80, gainPercent: 0, listedOn: "2026-08-10" },
      profile: {
        ...base.profile!,
        cmpRupees: 0,
        currentGainPercent: 0,
      },
    },
    null,
  );
  assert.equal(zero.summary.listingGainPercent, 0);
  assert.equal(zero.summary.cmpRupees, 0);
  assert.equal(zero.summary.currentGainPercent, 0);

  const negative = toDirectoryRow(
    {
      ...base,
      id: "loss-mills",
      slug: "loss-mills",
      listing: { issuePriceRupees: 100, listingPriceRupees: 80, gainPercent: -20, listedOn: "2026-08-10" },
      profile: {
        ...base.profile!,
        cmpRupees: 70,
        currentGainPercent: -12.5,
      },
    },
    null,
  );
  assert.equal(negative.summary.listingGainPercent, -20);
  assert.equal(negative.summary.currentGainPercent, -12.5);

  const absentProfile = toDirectoryRow(
    {
      ...base,
      id: "no-profile",
      slug: "no-profile",
      listing: null,
      profile: null,
    },
    null,
  );
  assert.equal(absentProfile.summary.listingGainPercent, null);
  assert.equal(absentProfile.summary.cmpRupees, null);
  assert.equal(absentProfile.summary.currentGainPercent, null);
});
