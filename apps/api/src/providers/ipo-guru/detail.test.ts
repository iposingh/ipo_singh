import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapIpoDetail, mergeIpoProfile } from "./detail.ts";

const now = new Date("2026-09-02T04:00:00.000Z");
const provenance = { sourceName: "IPO Guru Pro", retrievedAt: now.toISOString(), freshness: "fresh" as const };

const detail = {
  slug: "skyways-air-services-ipo",
  name: "Skyways Air Services",
  type: "Mainboard",
  status: "Closed",
  is_listed: true,
  timeline: {
    open_date: "2026-08-24",
    close_date: "2026-08-27",
    allotment_date: "2026-08-28",
    refund_date: "2026-08-31",
    credit_to_demat_date: "2026-08-31",
    listing_date: "2026-09-01",
  },
  issue: {
    issue_size: "582.8",
    issue_price: "138",
    price_min: 131,
    price_max: 138,
    lot_size: 100,
    min_investment: 13800,
  },
  listing: { listing_price: "124", listing_gain_percent: -10.14, cmp: "126.46", current_gain_percent: -8.36 },
  company: {
    about: "Skyways Air Services Limited is an Indian logistics company.",
    description: null,
    strengths: ["Sales have more than doubled in two years."],
    risks: ["Debt is high."],
    promoters: [{ name: "Promoter One", designation: "Founder" }, "Promoter Two"],
    promoters_text: "Founding group description.",
    objects_of_issue: { items: ["Repayment of borrowings"], text: "This prose is unused when items exist." },
    financials: {
      headers: ["31 Mar 2026", "31 Mar 2025", "31 Mar 2024"],
      rows: [{ metric: "Assets", data: ["1,508.24", "1,321.64", null] }],
      unit: "Rs. Crore",
      text: "Should not replace the table.",
    },
    kpis: [],
  },
  contacts: {
    registrar: {
      name: "Bigshare Services Private Limited",
      slug: "bigshare-services",
      status_page: "https://ipo.bigshareonline.com/ipo_status.html",
      supports_in_app: true,
    },
  },
  documents: {
    rhp: "https://example.com/rhp.pdf",
    drhp: null,
    anchor: { url: "https://example.com/anchor.pdf", title: "Anchor book" },
  },
};

describe("IPO Guru detail", () => {
  it("maps timeline, source financials, and a verified Bigshare link for a mainboard issue", () => {
    const mapped = mapIpoDetail(detail, now, provenance);
    assert.ok(mapped);
    assert.equal(mapped.ipo.board, "mainboard");
    assert.equal(mapped.ipo.status, "listed");
    assert.equal(mapped.ipo.offer.lotSizeShares, 100);
    assert.equal(mapped.ipo.offer.minimumInvestmentRupees, 13800);
    assert.equal(mapped.ipo.dates.allotmentDate, "2026-08-28");
    assert.equal(mapped.profile.refundDate, "2026-08-31");
    assert.equal(mapped.profile.dematCreditDate, "2026-08-31");
    assert.equal(mapped.profile.sourceFinancials.unit, "Rs. Crore");
    assert.equal(mapped.profile.sourceFinancials.rows[0]?.metric, "Assets");
    assert.equal(mapped.profile.sourceFinancials.text, null);
    assert.deepEqual(mapped.ipo.financials, []);
    assert.equal(mapped.profile.promoters[0]?.profile, "Founder");
    assert.equal(mapped.profile.promoters[1]?.name, "Promoter Two");
    assert.equal(mapped.profile.promoterNarrative, "Founding group description.");
    assert.deepEqual(mapped.profile.objectsOfIssue.items, ["Repayment of borrowings"]);
    assert.equal(mapped.ipo.registrar?.allotmentUrl, "https://ipo.bigshareonline.com/ipo_status.html");
    assert.equal(mapped.ipo.documents.length, 2);
    assert.equal(mapped.profile.cmpRupees, 126.46);
    assert.equal(mapped.ipo.listing?.listingPriceRupees, 124);
  });

  it("keeps SME classification and prose financials without inventing a table", () => {
    const mapped = mapIpoDetail(
      {
        ...detail,
        type: "SME",
        company: {
          about: null,
          financials: { text: "Revenue rose during the reported years.", rows: [], headers: [] },
          objects_of_issue: { text: "General corporate purposes." },
          kpis: [],
        },
        contacts: { registrar: { name: "Sample Registrar", slug: "sample-registrar", status_page: "https://registrar.example/allotment" } },
      },
      now,
      provenance,
    );
    assert.equal(mapped?.ipo.board, "sme");
    assert.equal(mapped?.profile.sourceFinancials.text, "Revenue rose during the reported years.");
    assert.equal(mapped?.profile.sourceFinancials.rows.length, 0);
    assert.equal(mapped?.profile.objectsOfIssue.text, "General corporate purposes.");
    assert.equal(mapped?.ipo.registrar?.name, "Sample Registrar");
    assert.equal(mapped?.ipo.registrar?.allotmentUrl, null);
  });

  it("rejects an unsafe vendor status page and falls back to the verified registrar portal when identity is known", () => {
    const mapped = mapIpoDetail(
      {
        ...detail,
        company: undefined,
        contacts: { registrar: { name: "KFin Technologies Limited", slug: "kfin-technologies", status_page: "javascript:alert(1)" } },
        locked: { company: "plan" },
      },
      now,
      provenance,
    );
    assert.equal(mapped?.companyPresent, false);
    assert.equal(mapped?.ipo.registrar?.allotmentUrl, "https://ipostatus.kfintech.com/");
    assert.equal(mapped?.profile.about, null);
    const unknown = mapIpoDetail(
      {
        ...detail,
        contacts: { registrar: { name: "Sample Registrar", slug: "sample-registrar", status_page: "javascript:alert(1)" } },
      },
      now,
      provenance,
    );
    assert.equal(unknown?.ipo.registrar?.allotmentUrl, null);
    const kept = mergeIpoProfile(
      { ...mapped!.profile, about: "Stored overview", sourceFinancials: { ...mapped!.profile.sourceFinancials, text: "Stored prose" } },
      mapped!.profile,
      false,
    );
    assert.equal(kept.about, "Stored overview");
    assert.equal(kept.refundDate, "2026-08-31");
  });
});
