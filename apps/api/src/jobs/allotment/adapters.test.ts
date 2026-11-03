import assert from "node:assert/strict";
import test from "node:test";
import {
  bigshareVerifyFromHtml,
  parseBigshareCompaniesFromHtml,
  parseBigshareCompanyOptions,
  parseKFinCompaniesFromBundle,
  resolveKFinMainBundleUrl,
  parseMufgGetDetailsPayload,
  createKFinAllotmentVerifier,
  createMUFGAllotmentVerifier,
  createBigshareAllotmentVerifier,
} from "./adapters/index.ts";
import type { AllotmentVerifyIssue } from "./types.ts";

const issue = (name: string): AllotmentVerifyIssue => ({
  ipoId: "ipo-1",
  slug: "fixture-polymers",
  companyName: name,
  status: "closed",
  openDate: "2026-10-01",
  closeDate: "2026-10-03",
  allotmentDate: "2026-10-08",
  listingDate: null,
  listingConfirmed: false,
  allotmentConfirmed: false,
  registrarId: "bigshare",
  registrarName: "Bigshare Services",
  allotmentUrl: "https://ipo.bigshareonline.com/ipo_status.html",
});

test("KFin resolves the current main bundle filename from HTML", () => {
  const html = `<script src="./static/js/main.f0d85b13.js"></script>`;
  assert.equal(resolveKFinMainBundleUrl(html), "https://ipostatus.kfintech.com/static/js/main.f0d85b13.js");
  assert.equal(resolveKFinMainBundleUrl(`<script src="/static/js/main.abc123.js"></script>`), "https://ipostatus.kfintech.com/static/js/main.abc123.js");
  assert.equal(resolveKFinMainBundleUrl("<html></html>"), null);
});

test("KFin extracts companies from the embedded JSON.parse payload", () => {
  const js = `const rf=JSON.parse('[{"clientId":"72794313091","name":"BLS POLYMERS LIMITED"},{"clientId":"1","name":"OTHER CO LIMITED"}]');`;
  const companies = parseKFinCompaniesFromBundle(js);
  assert.equal(companies.length, 2);
  assert.equal(companies[0]?.registrarCompanyId, "72794313091");
  assert.equal(companies[0]?.name, "BLS POLYMERS LIMITED");
});

test("KFin fails safely on a malformed bundle", () => {
  assert.throws(() => parseKFinCompaniesFromBundle("(()=>{var x=1})();"), /not found|empty|malformed/i);
});

test("KFin verify confirms a unique published company", async () => {
  const verifier = createKFinAllotmentVerifier({
    list: async () => ({
      registrar: "KFIN",
      status: "success",
      companies: [
        { registrarCompanyId: "72794313091", name: "BLS POLYMERS LIMITED", normalizedName: "bls polymers" },
      ],
      checkedAt: "2026-10-08T15:30:00.000Z",
      sourceUrl: "https://ipostatus.kfintech.com/static/js/main.test.js",
    }),
  });
  const result = await verifier.verify({
    issue: issue("BLS Polymers Limited"),
    now: new Date("2026-10-08T15:30:00.000Z"),
  });
  assert.equal(result.outcome, "confirmed");
  assert.equal(result.matchedCompanyId, "72794313091");
});

test("MUFG parses JSON-wrapped XML company rows", () => {
  const companies = parseMufgGetDetailsPayload({
    d: `<NewDataSet><Table><company_id>11970</company_id><companyname>SFC Environmental Technologies Limited-IPO</companyname></Table><Table><company_id>11969</company_id><companyname>EAAA India Alternatives Limited-IPO</companyname></Table></NewDataSet>`,
  });
  assert.equal(companies.length, 2);
  assert.equal(companies[0]?.registrarCompanyId, "11970");
  assert.match(companies[0]?.name ?? "", /SFC Environmental/);
});

test("MUFG rejects malformed XML and surfaces access failures", async () => {
  assert.throws(() => parseMufgGetDetailsPayload({ d: "<html></html>" }), /malformed|no company/i);
  const verifier = createMUFGAllotmentVerifier({
    list: async () => ({
      registrar: "MUFG",
      status: "unavailable",
      companies: [],
      checkedAt: "2026-10-08T15:30:00.000Z",
      sourceUrl: "https://in.mpms.mufg.com/Initial_Offer/IPO.aspx/GetDetails",
      errorCode: "http_403",
      errorMessage: "MUFG GetDetails HTTP 403",
    }),
  });
  const result = await verifier.verify({ issue: issue("EAAA India Alternatives Limited"), now: new Date() });
  assert.equal(result.outcome, "error");
  assert.match(result.note, /403|unavailable/i);
});

test("Bigshare parses active options and ignores HTML comments", () => {
  const html = `
    <select id="ddlCompany">
      <option value="0">--Select Company--</option>
      <!-- <option value="999">COMMENTED CO LIMITED</option> -->
      <option value="607">SHELLZ INDIA LIMITED</option>
      <option value="1" disabled>DISABLED CO</option>
    </select>`;
  const companies = parseBigshareCompaniesFromHtml(html);
  assert.deepEqual(
    companies.map((row) => [row.registrarCompanyId, row.name]),
    [["607", "SHELLZ INDIA LIMITED"]],
  );
  assert.equal(parseBigshareCompanyOptions(html).includes("COMMENTED CO LIMITED"), false);
});

test("Bigshare empty dropdown stays empty without inventing names", () => {
  const html = `<select id="ddlCompany"><option value="0">--Select Company--</option></select>`;
  assert.deepEqual(parseBigshareCompaniesFromHtml(html), []);
});

test("Bigshare confirms, refuses absent/ambiguous, and surfaces timeouts", async () => {
  const html = `<select id="ddlCompany"><option value="0">--Select Company--</option><option value="1">Fixture Polymers Limited</option><option value="2">Other Mills Ltd</option></select>`;
  assert.equal(bigshareVerifyFromHtml({ issue: { companyName: "Fixture Polymers Limited" }, html, now: new Date() }).outcome, "confirmed");
  assert.equal(bigshareVerifyFromHtml({ issue: { companyName: "Missing Co" }, html, now: new Date() }).outcome, "not_confirmed");
  const ambiguous = `<select id="ddlCompany"><option value="1">Fixture Polymers Limited</option><option value="2">Fixture Polymer Works Limited</option></select>`;
  assert.equal(
    bigshareVerifyFromHtml({
      issue: { companyName: "Fixture Polymers Limited", aliases: ["Fixture Polymer Works Limited"] },
      html: ambiguous,
      now: new Date(),
    }).outcome,
    "inconclusive",
  );
  const verifier = createBigshareAllotmentVerifier({
    fetchHtml: async () => {
      throw new Error("timeout");
    },
  });
  const errored = await verifier.verify({ issue: issue("Fixture Polymers Limited"), now: new Date() });
  assert.equal(errored.outcome, "error");
});
