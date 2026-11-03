import assert from "node:assert/strict";
import test from "node:test";
import { matchPublishedCompanies, matchPublishedIssueName, normalizeIssueLabel } from "./issue-match.ts";
import { registrarEntryForName, registrarPortalForName } from "./registrar-directory.ts";

test("normalizes legal suffixes, punctuation, unicode spaces, and -IPO tags", () => {
  assert.equal(normalizeIssueLabel("Acme Polymers Pvt. Ltd."), "acme polymers");
  assert.equal(normalizeIssueLabel("ACME & Co India Limited"), "acme and");
  assert.equal(normalizeIssueLabel("SFC Environmental Technologies Limited-IPO"), "sfc environmental technologies");
  assert.equal(normalizeIssueLabel("Paras Healthcare Limited -\u00a0IPO"), "paras healthcare");
});

test("requires a unique normalized equality match", () => {
  assert.deepEqual(
    matchPublishedIssueName({
      companyName: "Fixture Polymers Limited",
      publishedNames: ["Fixture Polymers Ltd", "Other Co"],
    }),
    { status: "matched", matchedName: "Fixture Polymers Ltd", matchedId: null },
  );
  assert.equal(
    matchPublishedIssueName({
      companyName: "Unknown Mills",
      publishedNames: ["Fixture Polymers Ltd"],
    }).status,
    "none",
  );
  assert.equal(
    matchPublishedIssueName({
      companyName: "Fixture Polymers Limited",
      aliases: ["Fixture Polymer Works Limited"],
      publishedNames: ["Fixture Polymers Limited", "Fixture Polymer Works Limited"],
    }).status,
    "ambiguous",
  );
});

test("prefers a previously verified registrar company id", () => {
  assert.deepEqual(
    matchPublishedCompanies({
      companyName: "Wrong Name",
      registrarCompanyId: "11970",
      published: [
        { id: "11970", name: "SFC Environmental Technologies Limited-IPO" },
        { id: "1", name: "Other" },
      ],
    }),
    {
      status: "matched",
      matchedName: "SFC Environmental Technologies Limited-IPO",
      matchedId: "11970",
    },
  );
});

test("registrar aliases resolve uniquely", () => {
  assert.equal(registrarEntryForName("Link Intime India Limited")?.id, "mufg-intime");
  assert.equal(registrarEntryForName("KFin Technologies")?.verificationAdapter, "kfin");
  assert.equal(registrarEntryForName("Bigshare Services Private Limited")?.id, "bigshare");
  assert.equal(registrarEntryForName("Unknown Registrar"), null);
  assert.equal(registrarPortalForName("MUFG Intime"), "https://in.mpms.mufg.com/Initial_Offer/public-issues.html");
});
