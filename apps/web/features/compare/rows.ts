import type { Ipo, IpoStatus, SubscriptionSnapshot } from "@ipo-singh/contracts";
import { formatIstDateTime, formatPriceBand, freshnessLabel, isPresentNumber, type Freshness } from "@ipo-singh/core";
import { categoryLabel } from "../ipo-details/subscription-chart.ts";
import { actualListingPerformance } from "../ipos/listed.ts";
import { minimumInvestmentAmount, summarizeGmp } from "../ipos/gmp-summary.ts";

export type CompareColumn =
  | { state: "stored"; ipo: Ipo }
  | { state: "missing"; slug: string };

export type CompareDisplay =
  | { type: "link"; slug: string; name: string }
  | { type: "missing-name"; slug: string }
  | { type: "board"; board: Ipo["board"] }
  | { type: "status"; status: IpoStatus | null; allotmentConfirmed?: boolean | null }
  | { type: "band"; lowRupees: number | null; highRupees: number | null }
  | { type: "shares"; shares: number | null }
  | { type: "inr"; rupees: number | null; missingLabel: string }
  | { type: "date"; iso: string | null }
  | { type: "gmp"; amountRupees: number | null; percent: number | null; freshness: Freshness | null }
  | { type: "times"; times: number | null }
  | { type: "gain"; percent: number | null }
  | { type: "text"; text: string; missing: boolean };

export type CompareCell = {
  comparable: string;
  display: CompareDisplay;
};

export type CompareRow = {
  id: string;
  label: string;
  cells: CompareCell[];
  differs: boolean;
};

const fixedCategories = [
  { id: "subscription-retail", label: "Retail subscription", key: "RETAIL" },
  { id: "subscription-qib", label: "QIB subscription", key: "QIB" },
  { id: "subscription-nii", label: "NII subscription", key: "NII" },
  { id: "subscription-employee", label: "Employee subscription", key: "EMPLOYEE" },
  { id: "subscription-shareholder", label: "Shareholder subscription", key: "SHAREHOLDER" },
  { id: "subscription-anchor", label: "Anchor subscription", key: "ANCHOR" },
] as const;

const fixedKeys = new Set<string>(["TOTAL", ...fixedCategories.map((item) => item.key)]);

const financialMetrics = [
  { id: "revenue", label: "Revenue", field: "revenueRupees", missingLabel: "Revenue unavailable" },
  { id: "profit", label: "Profit after tax", field: "profitAfterTaxRupees", missingLabel: "Profit after tax unavailable" },
  { id: "eps", label: "Earnings per share", field: "earningsPerShareRupees", missingLabel: "Earnings per share unavailable" },
] as const;

function textCell(text: string, missing: boolean, comparable = missing ? "missing" : text): CompareCell {
  return { comparable, display: { type: "text", text, missing } };
}

function inrCell(rupees: number | null, missingLabel: string): CompareCell {
  const present = isPresentNumber(rupees);
  return {
    comparable: present ? String(rupees) : "missing",
    display: { type: "inr", rupees: present ? rupees : null, missingLabel },
  };
}

function timesCell(times: number | null): CompareCell {
  return {
    comparable: times === null ? "missing" : String(times),
    display: { type: "times", times },
  };
}

function row(id: string, label: string, cells: CompareCell[], mark = true): CompareRow {
  const differs = mark && new Set(cells.map((cell) => cell.comparable)).size > 1;
  return { id, label, cells, differs };
}

function across(columns: readonly CompareColumn[], present: (ipo: Ipo) => CompareCell, absent: CompareCell): CompareCell[] {
  return columns.map((column) => (column.state === "stored" ? present(column.ipo) : absent));
}

function namedTimes(snapshot: SubscriptionSnapshot | null, key: string): number | null {
  if (!snapshot) return null;
  if (key === "TOTAL") return isPresentNumber(snapshot.totalTimes) ? snapshot.totalTimes : null;
  const category = snapshot.categories?.find((item) => item.key === key);
  if (category) return isPresentNumber(category.times) ? category.times : null;
  const field =
    key === "RETAIL"
      ? snapshot.retailTimes
      : key === "QIB"
        ? snapshot.qibTimes
        : key === "NII"
          ? snapshot.niiTimes
          : key === "EMPLOYEE"
            ? snapshot.employeeTimes
            : key === "SHAREHOLDER"
              ? snapshot.shareholderTimes
              : snapshot.anchorTimes;
  return isPresentNumber(field) ? field : null;
}

function updatedText(value: string | null): string {
  if (!value) return "Last updated: Unavailable";
  const date = new Date(value);
  return formatIstDateTime(Number.isNaN(date.getTime()) ? null : date);
}

export function buildCompareRows(columns: readonly CompareColumn[]): CompareRow[] {
  if (columns.length === 0) return [];
  const absentInr = (missingLabel: string): CompareCell => inrCell(null, missingLabel);
  const rows: CompareRow[] = [
    row(
      "company",
      "Company",
      across(
        columns,
        (ipo) => ({ comparable: ipo.companyName, display: { type: "link", slug: ipo.slug, name: ipo.companyName } }),
        { comparable: "missing", display: { type: "missing-name", slug: "" } },
      ),
      false,
    ),
    row(
      "board",
      "Category",
      across(
        columns,
        (ipo) => ({ comparable: ipo.board, display: { type: "board", board: ipo.board } }),
        textCell("Category unavailable", true),
      ),
    ),
    row(
      "status",
      "Status",
      across(
        columns,
        (ipo) => ({ comparable: ipo.status ?? "missing", display: { type: "status", status: ipo.status } }),
        { comparable: "missing", display: { type: "status", status: null } },
      ),
    ),
    row(
      "price-band",
      "Price band",
      across(
        columns,
        (ipo) => ({
          comparable: formatPriceBand(ipo.offer.priceBand.lowRupees, ipo.offer.priceBand.highRupees),
          display: { type: "band", lowRupees: ipo.offer.priceBand.lowRupees, highRupees: ipo.offer.priceBand.highRupees },
        }),
        { comparable: formatPriceBand(null, null), display: { type: "band", lowRupees: null, highRupees: null } },
      ),
    ),
    row(
      "lot",
      "Lot size",
      across(
        columns,
        (ipo) => ({
          comparable: isPresentNumber(ipo.offer.lotSizeShares) ? String(ipo.offer.lotSizeShares) : "missing",
          display: { type: "shares", shares: isPresentNumber(ipo.offer.lotSizeShares) ? ipo.offer.lotSizeShares : null },
        }),
        { comparable: "missing", display: { type: "shares", shares: null } },
      ),
    ),
    row(
      "minimum",
      "Minimum investment",
      across(
        columns,
        (ipo) => {
          const amount = minimumInvestmentAmount(ipo.offer);
          return inrCell(amount.status === "value" ? amount.value : null, "Minimum investment unavailable");
        },
        absentInr("Minimum investment unavailable"),
      ),
    ),
    row(
      "issue-size",
      "Issue size",
      across(
        columns,
        (ipo) => inrCell(ipo.offer.issueSizeRupees, "Issue size unavailable"),
        absentInr("Issue size unavailable"),
      ),
    ),
    row(
      "open",
      "Opening date",
      across(
        columns,
        (ipo) => ({ comparable: ipo.dates.openDate ?? "missing", display: { type: "date", iso: ipo.dates.openDate } }),
        { comparable: "missing", display: { type: "date", iso: null } },
      ),
    ),
    row(
      "close",
      "Closing date",
      across(
        columns,
        (ipo) => ({ comparable: ipo.dates.closeDate ?? "missing", display: { type: "date", iso: ipo.dates.closeDate } }),
        { comparable: "missing", display: { type: "date", iso: null } },
      ),
    ),
    row(
      "gmp",
      "Current GMP",
      across(
        columns,
        (ipo) => {
          const summary = summarizeGmp({
            gmpAmountRupees: ipo.gmp?.amountRupees,
            issuePriceRupees: ipo.offer.issuePriceRupees,
            priceBandLowRupees: ipo.offer.priceBand.lowRupees,
            priceBandHighRupees: ipo.offer.priceBand.highRupees,
          });
          const freshness = ipo.gmp?.freshness ?? null;
          if (!summary.available || !isPresentNumber(ipo.gmp?.amountRupees)) {
            return { comparable: "missing", display: { type: "gmp", amountRupees: null, percent: null, freshness } };
          }
          return {
            comparable: `${ipo.gmp.amountRupees}:${summary.percent ?? "missing"}`,
            display: { type: "gmp", amountRupees: ipo.gmp.amountRupees, percent: summary.percent, freshness },
          };
        },
        { comparable: "missing", display: { type: "gmp", amountRupees: null, percent: null, freshness: null } },
      ),
    ),
  ];

  rows.push(
    row(
      "subscription-total",
      "Subscription total",
      across(columns, (ipo) => timesCell(namedTimes(ipo.subscription, "TOTAL")), timesCell(null)),
    ),
  );

  for (const category of fixedCategories) {
    const cells = across(columns, (ipo) => timesCell(namedTimes(ipo.subscription, category.key)), timesCell(null));
    if (cells.some((cell) => cell.comparable !== "missing")) rows.push(row(category.id, category.label, cells));
  }

  const extras: { key: string; label: string }[] = [];
  const subs: { id: string; parent: string; key: string; label: string }[] = [];
  for (const column of columns) {
    if (column.state !== "stored") continue;
    for (const category of column.ipo.subscription?.categories ?? []) {
      if (!fixedKeys.has(category.key) && isPresentNumber(category.times) && !extras.some((item) => item.key === category.key)) {
        extras.push({ key: category.key, label: `${categoryLabel(category.key)} subscription` });
      }
      for (const sub of category.subcategories) {
        const id = `${category.key}:${sub.key}`;
        if (isPresentNumber(sub.times) && !subs.some((item) => item.id === id)) {
          subs.push({ id, parent: category.key, key: sub.key, label: `${categoryLabel(category.key)} · ${categoryLabel(sub.key)}` });
        }
      }
    }
  }
  for (const extra of extras) {
    rows.push(row(`subscription-${extra.key}`, extra.label, across(columns, (ipo) => timesCell(namedTimes(ipo.subscription, extra.key)), timesCell(null))));
  }
  for (const sub of subs) {
    rows.push(
      row(
        `subscription-${sub.id}`,
        sub.label,
        across(
          columns,
          (ipo) => {
            const category = ipo.subscription?.categories?.find((item) => item.key === sub.parent);
            const found = category?.subcategories.find((item) => item.key === sub.key);
            return timesCell(found && isPresentNumber(found.times) ? found.times : null);
          },
          timesCell(null),
        ),
      ),
    );
  }

  const financialStart = rows.length;
  const years: string[] = [];
  for (const column of columns) {
    if (column.state !== "stored") continue;
    for (const period of column.ipo.financials) {
      if (!years.includes(period.fiscalYearLabel)) years.push(period.fiscalYearLabel);
    }
  }
  for (const year of years) {
    for (const metric of financialMetrics) {
      const cells = across(
        columns,
        (ipo) => {
          const period = ipo.financials.find((item) => item.fiscalYearLabel === year);
          const value = period ? period[metric.field] : null;
          return inrCell(value, metric.missingLabel);
        },
        absentInr(metric.missingLabel),
      );
      if (cells.some((cell) => cell.comparable !== "missing")) rows.push(row(`${metric.id}:${year}`, `${metric.label} · ${year}`, cells));
    }
  }
  if (rows.length === financialStart) {
    rows.push(row("financials", "Financials", across(columns, () => absentInr("Financials unavailable"), absentInr("Financials unavailable"))));
  }

  rows.push(
    row(
      "listing-date",
      "Listing date",
      across(
        columns,
        (ipo) => ({ comparable: ipo.dates.listingDate ?? "missing", display: { type: "date", iso: ipo.dates.listingDate } }),
        { comparable: "missing", display: { type: "date", iso: null } },
      ),
    ),
    row(
      "listing-gain",
      "Listing gain",
      across(
        columns,
        (ipo) => {
          const gain = actualListingPerformance(ipo).gainPercent;
          return { comparable: gain === null ? "missing" : String(gain), display: { type: "gain", percent: gain } };
        },
        { comparable: "missing", display: { type: "gain", percent: null } },
      ),
    ),
    row(
      "source",
      "Source",
      across(
        columns,
        (ipo) => textCell(ipo.provenance.sourceName, false),
        textCell("Source unavailable", true),
      ),
    ),
    row(
      "freshness",
      "Freshness",
      across(
        columns,
        (ipo) => textCell(freshnessLabel(ipo.provenance.freshness), ipo.provenance.freshness === "missing", ipo.provenance.freshness),
        textCell(freshnessLabel("missing"), true, "missing"),
      ),
    ),
    row(
      "updated",
      "Last updated",
      across(
        columns,
        (ipo) => textCell(updatedText(ipo.provenance.retrievedAt), ipo.provenance.retrievedAt === null, ipo.provenance.retrievedAt ?? "missing"),
        textCell(updatedText(null), true),
      ),
    ),
  );

  return rows.map((item) => {
    if (item.id !== "company") return item;
    return {
      ...item,
      cells: item.cells.map((cell, cellIndex) => {
        const column = columns[cellIndex];
        if (column?.state !== "missing" || cell.display.type !== "missing-name") return cell;
        return { comparable: "missing", display: { type: "missing-name", slug: column.slug } };
      }),
    };
  });
}
