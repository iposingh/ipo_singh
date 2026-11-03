import type { Ipo, SubscriptionSnapshot } from "@ipo-singh/contracts";
import {
  actualListingGainPercent,
  applicableIssuePriceRupees,
  formatInr,
  formatInrScale,
  formatIstDate,
  formatLastUpdated,
  formatSignedPercent,
  formatSubscriptionMultiple,
  freshnessLabel,
  indicativeGmpImpliedPrice,
  isIndicativeGmpPrice,
  isPresentNumber,
  unofficialGmpDisclaimer,
} from "@ipo-singh/core";
import { currentGmpPercent, offerFacts } from "../catalogue/facts.ts";
import { allotmentStatusLabel, boardLabel, listingLifecycleLabel } from "../design/copy.ts";

export type DetailFact = { label: string; value: string };

const categoryLabels: Record<string, string> = {
  TOTAL: "Total",
  RETAIL: "Retail",
  QIB: "QIB",
  NII: "NII / HNI",
  EMPLOYEE: "Employee",
  SHAREHOLDER: "Shareholder",
  ANCHOR: "Anchor",
  FII: "FII",
  DFI: "DFI",
  MF: "Mutual funds",
  OTHERS: "Others",
  SNII: "sNII",
  BNII: "bNII",
};

function categoryLabel(key: string): string {
  return categoryLabels[key] ?? key;
}

function timesText(value: number | null | undefined): string {
  return isPresentNumber(value) ? formatSubscriptionMultiple(value) : "Unavailable";
}

function dateValue(value: string | null | undefined): string {
  const text = formatIstDate(value);
  return text === "Unavailable" ? "Unavailable" : text;
}

function flatTimes(snapshot: SubscriptionSnapshot, key: string): number | null | undefined {
  if (key === "RETAIL") return snapshot.retailTimes;
  if (key === "QIB") return snapshot.qibTimes;
  if (key === "NII") return snapshot.niiTimes;
  if (key === "EMPLOYEE") return snapshot.employeeTimes;
  if (key === "SHAREHOLDER") return snapshot.shareholderTimes;
  if (key === "ANCHOR") return snapshot.anchorTimes;
  return null;
}

export function overviewModel(ipo: Ipo): {
  facts: DetailFact[];
  about: string | null;
  description: string | null;
  statusLabel: string;
} {
  const offer = offerFacts(ipo);
  const profile = ipo.profile ?? null;
  const status = listingLifecycleLabel({ status: ipo.status, allotmentConfirmed: ipo.allotmentConfirmed });
  const facts: DetailFact[] = [
    { label: "Company", value: ipo.companyName },
    { label: "Issue category", value: boardLabel(ipo.board) },
    { label: "Status", value: status },
    { label: "Price band", value: offer.priceBand },
    { label: "Issue size", value: isPresentNumber(ipo.offer.issueSizeRupees) ? formatInrScale(ipo.offer.issueSizeRupees) : "Unavailable" },
    { label: "Lot size", value: offer.lotSize },
    { label: "Minimum investment", value: offer.minimumInvestment },
    { label: "Opens", value: dateValue(ipo.dates.openDate) },
    { label: "Closes", value: dateValue(ipo.dates.closeDate) },
    { label: "Allotment date", value: dateValue(ipo.dates.allotmentDate) },
    { label: "Listing date", value: dateValue(ipo.dates.listingDate) },
    { label: "Registrar", value: ipo.registrar?.name ?? "Unavailable" },
    /**
     * NSE/BSE exchange flags are not on the public IPO document.
     * Board (Mainboard / SME) is the stored category — do not invent exchange names.
     */
    { label: "Exchange", value: "Unavailable" },
  ];
  if (profile?.refundDate) facts.push({ label: "Refund date", value: dateValue(profile.refundDate) });
  if (profile?.dematCreditDate) facts.push({ label: "Demat credit", value: dateValue(profile.dematCreditDate) });
  return { facts, about: profile?.about ?? null, description: profile?.description ?? null, statusLabel: status };
}

export function profileModel(ipo: Ipo): {
  strengths: readonly string[];
  risks: readonly string[];
  promoters: readonly { name: string; profile: string | null }[];
  promoterNarrative: string | null;
  objects: { items: readonly string[]; text: string | null } | null;
  hasCompanyCopy: boolean;
} {
  const profile = ipo.profile ?? null;
  const objects = profile?.objectsOfIssue ?? null;
  const hasObjects = Boolean(objects && (objects.items.length > 0 || objects.text));
  return {
    strengths: profile?.strengths ?? [],
    risks: profile?.risks ?? [],
    promoters: profile?.promoters ?? [],
    promoterNarrative: profile?.promoterNarrative ?? null,
    objects: hasObjects && objects ? { items: objects.items, text: objects.text } : null,
    hasCompanyCopy: Boolean(profile?.about || profile?.description),
  };
}

export function allotmentModel(ipo: Ipo): {
  status: "Allotment Out" | "Allotment Awaited";
  date: string;
  registrar: string;
  confirmed: boolean;
} {
  return {
    status: allotmentStatusLabel(ipo.allotmentConfirmed),
    date: dateValue(ipo.dates.allotmentDate),
    registrar: ipo.registrar?.name ?? "Unavailable",
    confirmed: ipo.allotmentConfirmed === true,
  };
}

export function gmpModel(ipo: Ipo): {
  amount: string;
  percent: string;
  freshness: string;
  disclaimer: string | null;
  indicative: string;
  indicativeNote: string | null;
  updated: string;
  missing: boolean;
} {
  const amount = ipo.gmp?.amountRupees ?? null;
  const percent = currentGmpPercent(ipo);
  const price = applicableIssuePriceRupees({
    issuePriceRupees: ipo.offer.issuePriceRupees,
    priceBandLowRupees: ipo.offer.priceBand.lowRupees,
    priceBandHighRupees: ipo.offer.priceBand.highRupees,
  });
  const implied = indicativeGmpImpliedPrice({
    gmpAmountRupees: amount,
    issuePriceRupees: price.status === "value" ? price.value : null,
  });
  const observed = ipo.gmp?.observedAt ? new Date(ipo.gmp.observedAt) : null;
  return {
    amount: isPresentNumber(amount) ? formatInr(amount) : "GMP unavailable",
    percent: isPresentNumber(percent) ? formatSignedPercent(percent) : "Percent unavailable",
    freshness: freshnessLabel(ipo.gmp?.freshness ?? "missing"),
    disclaimer: isPresentNumber(amount) ? unofficialGmpDisclaimer : null,
    indicative: isIndicativeGmpPrice(implied) ? formatInr(implied.rupees) : "Indicative price unavailable",
    indicativeNote: isIndicativeGmpPrice(implied) ? implied.disclaimer : null,
    updated: formatLastUpdated(observed && !Number.isNaN(observed.getTime()) ? observed : null),
    missing: !isPresentNumber(amount),
  };
}

export type SubscriptionLine = { label: string; value: string; children: { label: string; value: string }[] };

export function subscriptionModel(ipo: Ipo): { total: string; rows: SubscriptionLine[]; updated: string; freshness: string | null } {
  const snapshot = ipo.subscription;
  if (!snapshot) return { total: "Unavailable", rows: [], updated: "Last updated: Unavailable", freshness: null };
  const categories = snapshot.categories ?? [];
  const preferred = ["RETAIL", "QIB", "NII", "EMPLOYEE", "SHAREHOLDER", "ANCHOR"];
  const rows = preferred.flatMap((key) => {
    const category = categories.find((item) => item.key === key);
    const times = category ? category.times : flatTimes(snapshot, key);
    const required = key === "RETAIL" || key === "QIB" || key === "NII";
    if (!required && !category && !isPresentNumber(times)) return [];
    return [
      {
        label: categoryLabel(key),
        value: timesText(times),
        children: (category?.subcategories ?? []).map((item) => ({ label: categoryLabel(item.key), value: timesText(item.times) })),
      },
    ];
  });
  const seen = new Set(preferred);
  for (const category of categories) {
    if (seen.has(category.key) || category.key === "TOTAL") continue;
    rows.push({
      label: categoryLabel(category.key),
      value: timesText(category.times),
      children: category.subcategories.map((item) => ({ label: categoryLabel(item.key), value: timesText(item.times) })),
    });
  }
  const observed = snapshot.observedAt ? new Date(snapshot.observedAt) : null;
  return {
    total: timesText(snapshot.totalTimes),
    rows,
    updated: formatLastUpdated(observed && !Number.isNaN(observed.getTime()) ? observed : null),
    freshness: freshnessLabel(snapshot.freshness),
  };
}

export type FinancialPeriodRow = { period: string; revenue: string; profit: string; earnings: string };
export type SourceFinancialRow = { metric: string; values: string[] };

export function financialModel(ipo: Ipo): {
  periods: FinancialPeriodRow[];
  unit: string | null;
  headers: string[];
  rows: SourceFinancialRow[];
  text: string | null;
  empty: boolean;
} {
  const source = ipo.profile?.sourceFinancials ?? null;
  const periods = ipo.financials.map((period) => ({
    period: period.fiscalYearLabel,
    revenue: formatInr(period.revenueRupees),
    profit: formatInr(period.profitAfterTaxRupees),
    earnings: formatInr(period.earningsPerShareRupees),
  }));
  const rows = (source?.rows ?? []).map((row) => ({
    metric: row.metric,
    values: row.values.map((value) => (value && value.trim().length > 0 ? value : "Unavailable")),
  }));
  const text = source?.rows.length ? null : (source?.text ?? null);
  return {
    periods,
    unit: source?.unit ?? null,
    headers: source?.headers ?? [],
    rows,
    text,
    empty: periods.length === 0 && rows.length === 0 && !text,
  };
}

export function listingModel(ipo: Ipo): DetailFact[] {
  const listing = ipo.listing;
  const offerPrice = applicableIssuePriceRupees({
    issuePriceRupees: ipo.offer.issuePriceRupees,
    priceBandLowRupees: ipo.offer.priceBand.lowRupees,
    priceBandHighRupees: ipo.offer.priceBand.highRupees,
  });
  const issuePrice = isPresentNumber(listing?.issuePriceRupees) ? listing.issuePriceRupees : offerPrice.status === "value" ? offerPrice.value : null;
  const listingPrice = isPresentNumber(listing?.listingPriceRupees) ? listing.listingPriceRupees : null;
  const calculated = actualListingGainPercent({ listingPriceRupees: listingPrice, issuePriceRupees: issuePrice });
  const gain = calculated.status === "value" ? calculated.value : isPresentNumber(listing?.gainPercent) ? listing.gainPercent : null;
  const profile = ipo.profile ?? null;
  return [
    { label: "Listing date", value: dateValue(ipo.dates.listingDate) },
    { label: "Issue price", value: isPresentNumber(issuePrice) ? formatInr(issuePrice) : "Unavailable" },
    { label: "Listing price", value: listing ? formatInr(listingPrice) : "Unavailable" },
    { label: "Listing gain or loss", value: isPresentNumber(gain) ? formatSignedPercent(gain) : "Unavailable" },
    { label: "Current price", value: profile ? formatInr(profile.cmpRupees) : "Unavailable" },
    { label: "Change since listing", value: profile && isPresentNumber(profile.currentGainPercent) ? formatSignedPercent(profile.currentGainPercent) : "Unavailable" },
  ];
}

const documentLabels = { drhp: "DRHP", rhp: "RHP", source: "Source" } as const;

export function documentModel(ipo: Ipo, accept: (url: string) => string | null): { label: string; title: string; url: string; published: string }[] {
  return ipo.documents.flatMap((document) => {
    const url = accept(document.url);
    if (!url) return [];
    return [{ label: documentLabels[document.kind], title: document.title, url, published: dateValue(document.publishedOn) }];
  });
}

export function anchorModel(ipo: Ipo): {
  investors: readonly {
    name: string;
    group: string | null;
    shares: string;
    amount: string;
    allocatedPercent: string;
    issuePercent: string;
  }[];
  summary: DetailFact[];
} {
  const anchors = ipo.profile?.anchors;
  if (!anchors || anchors.investors.length === 0) return { investors: [], summary: [] };
  const summary: DetailFact[] = [];
  if (isPresentNumber(anchors.totalCount)) summary.push({ label: "Anchor investors", value: String(anchors.totalCount) });
  if (isPresentNumber(anchors.totalAmountCrore)) summary.push({ label: "Total amount", value: `₹${anchors.totalAmountCrore} crore` });
  if (isPresentNumber(anchors.mutualFundCount)) summary.push({ label: "Mutual fund anchors", value: String(anchors.mutualFundCount) });
  return {
    summary,
    investors: anchors.investors.map((investor) => ({
      name: investor.name,
      group: investor.group,
      shares: investor.shares === null ? "Unavailable" : `${investor.shares} shares`,
      amount: investor.amountCrore === null ? "Unavailable" : `₹${investor.amountCrore} crore`,
      allocatedPercent: investor.allocatedPercent === null ? "Unavailable" : `${investor.allocatedPercent}%`,
      issuePercent: investor.issuePercent === null ? "Unavailable" : `${investor.issuePercent}%`,
    })),
  };
}
