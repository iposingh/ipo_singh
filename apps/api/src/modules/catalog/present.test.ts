import assert from "node:assert/strict";
import test from "node:test";
import type { CompanyRecord, IpoRecord, RegistrarRecord, SourceDocumentRecord, SourceMetadataRecord } from "../../db/records.ts";
import { publicHttpUrl, publicPlainText } from "../../shared/public-text.ts";
import { registrarPayload, toIpo } from "./present.ts";

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
