import type { Ipo } from "@ipo-singh/contracts";
import { financialModel, gmpModel, listingModel, overviewModel, subscriptionModel } from "../detail/model.ts";

export type CompareColumn = { state: "stored"; ipo: Ipo } | { state: "missing"; slug: string };

export type CompareRow = {
  id: string;
  label: string;
  values: string[];
};

const missingName = "This IPO is not stored.";

function storedValue(column: CompareColumn, read: (ipo: Ipo) => string): string {
  return column.state === "stored" ? read(column.ipo) : "Unavailable";
}

function fact(ipo: Ipo, label: string): string {
  return overviewModel(ipo).facts.find((item) => item.label === label)?.value ?? "Unavailable";
}

function listingFact(ipo: Ipo, label: string): string {
  return listingModel(ipo).find((item) => item.label === label)?.value ?? "Unavailable";
}

export function compareTable(columns: readonly CompareColumn[]): CompareRow[] {
  if (columns.length === 0) return [];
  const rows: CompareRow[] = [
    { id: "company", label: "Company", values: columns.map((column) => (column.state === "stored" ? column.ipo.companyName : missingName)) },
    { id: "category", label: "Category", values: columns.map((column) => storedValue(column, (ipo) => fact(ipo, "Issue category"))) },
    { id: "status", label: "Status", values: columns.map((column) => storedValue(column, (ipo) => fact(ipo, "Status"))) },
    { id: "price-band", label: "Price band", values: columns.map((column) => storedValue(column, (ipo) => fact(ipo, "Price band"))) },
    { id: "lot", label: "Lot size", values: columns.map((column) => storedValue(column, (ipo) => fact(ipo, "Lot size"))) },
    { id: "minimum", label: "Minimum investment", values: columns.map((column) => storedValue(column, (ipo) => fact(ipo, "Minimum investment"))) },
    { id: "issue-size", label: "Issue size", values: columns.map((column) => storedValue(column, (ipo) => fact(ipo, "Issue size"))) },
    { id: "gmp", label: "Current GMP", values: columns.map((column) => storedValue(column, (ipo) => gmpModel(ipo).amount)) },
    { id: "gmp-percent", label: "GMP percentage", values: columns.map((column) => storedValue(column, (ipo) => gmpModel(ipo).percent)) },
    { id: "open", label: "Opening date", values: columns.map((column) => storedValue(column, (ipo) => fact(ipo, "Opens"))) },
    { id: "close", label: "Closing date", values: columns.map((column) => storedValue(column, (ipo) => fact(ipo, "Closes"))) },
    { id: "allotment", label: "Allotment date", values: columns.map((column) => storedValue(column, (ipo) => fact(ipo, "Allotment date"))) },
    { id: "listing-date", label: "Listing date", values: columns.map((column) => storedValue(column, (ipo) => fact(ipo, "Listing date"))) },
  ];

  const subscriptionLabels: string[] = [];
  for (const column of columns) {
    if (column.state !== "stored") continue;
    const model = subscriptionModel(column.ipo);
    if (!subscriptionLabels.includes("Subscription total")) subscriptionLabels.push("Subscription total");
    for (const line of model.rows) {
      if (!subscriptionLabels.includes(line.label)) subscriptionLabels.push(line.label);
      for (const child of line.children) {
        const label = `${line.label} · ${child.label}`;
        if (!subscriptionLabels.includes(label)) subscriptionLabels.push(label);
      }
    }
  }
  for (const label of subscriptionLabels) {
    rows.push({
      id: `subscription-${label}`,
      label,
      values: columns.map((column) => {
        if (column.state !== "stored") return "Unavailable";
        const model = subscriptionModel(column.ipo);
        if (label === "Subscription total") return model.total;
        const line = model.rows.find((item) => item.label === label);
        if (line) return line.value;
        const child = model.rows.flatMap((item) => item.children.map((entry) => ({ label: `${item.label} · ${entry.label}`, value: entry.value }))).find((item) => item.label === label);
        return child?.value ?? "Unavailable";
      }),
    });
  }

  const years: string[] = [];
  for (const column of columns) {
    if (column.state !== "stored") continue;
    for (const period of financialModel(column.ipo).periods) {
      if (!years.includes(period.period)) years.push(period.period);
    }
  }
  if (years.length === 0) {
    rows.push({ id: "financials", label: "Financials", values: columns.map(() => "Unavailable") });
  }
  for (const year of years) {
    for (const metric of [
      { id: "revenue", label: "Revenue", field: "revenue" },
      { id: "profit", label: "Profit after tax", field: "profit" },
      { id: "eps", label: "Earnings per share", field: "earnings" },
    ] as const) {
      rows.push({
        id: `${metric.id}-${year}`,
        label: `${metric.label} · ${year} (₹)`,
        values: columns.map((column) => {
          if (column.state !== "stored") return "Unavailable";
          const period = financialModel(column.ipo).periods.find((item) => item.period === year);
          return period ? period[metric.field] : "Unavailable";
        }),
      });
    }
  }

  rows.push(
    { id: "listing-price", label: "Listing price", values: columns.map((column) => storedValue(column, (ipo) => listingFact(ipo, "Listing price"))) },
    { id: "listing-gain", label: "Listing gain or loss", values: columns.map((column) => storedValue(column, (ipo) => listingFact(ipo, "Listing gain or loss"))) },
  );
  return rows;
}

export const compareNote = "This comparison lists stored figures. It does not recommend an IPO. Grey market premium is unofficial and is not a guaranteed return.";
