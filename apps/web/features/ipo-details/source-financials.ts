import type { SourceFinancials } from "@ipo-singh/contracts";

export type SourceFinancialPoint = {
  label: string;
  value: number;
};

/** Indian grouped figures such as `1,508.24` stay numbers. Blank and non-numeric cells stay out of the chart. */
export function parseSourceAmount(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sourceFinancialSeries(financials: SourceFinancials, rowIndex: number): SourceFinancialPoint[] {
  const row = financials.rows[rowIndex];
  if (!row) return [];
  return row.values.flatMap((value, index) => {
    const parsed = parseSourceAmount(value);
    const label = financials.headers[index];
    if (parsed === null || !label) return [];
    return [{ label, value: parsed }];
  });
}

export function chartableSourceRows(financials: SourceFinancials): number[] {
  return financials.rows.flatMap((_row, index) => (sourceFinancialSeries(financials, index).length >= 2 ? [index] : []));
}

export type SourceMetricGroup = "assets" | "liabilities" | "ratios";

export type SourceMetricReading = {
  metric: string;
  period: string;
  value: string;
  group: SourceMetricGroup;
};

/** Classify a published metric name. Unrelated rows stay out of the assets, liabilities, and ratios summary. */
export function classifySourceMetric(metric: string): SourceMetricGroup | null {
  const text = metric.trim();
  if (/\bliabilit/i.test(text)) return "liabilities";
  if (/\bassets?\b/i.test(text)) return "assets";
  if (/\bratio\b/i.test(text)) return "ratios";
  return null;
}

/** First published cell for a matching metric. Blank cells are skipped and are not replaced with zero. */
export function sourceMetricReadings(financials: SourceFinancials): SourceMetricReading[] {
  return financials.rows.flatMap((row) => {
    const group = classifySourceMetric(row.metric);
    if (!group) return [];
    const index = row.values.findIndex((value) => Boolean(value?.trim()));
    const value = index >= 0 ? row.values[index] : null;
    const period = index >= 0 ? financials.headers[index] : null;
    if (!value || !period) return [];
    return [{ metric: row.metric, period, value, group }];
  });
}
