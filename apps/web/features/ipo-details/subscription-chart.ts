import type { SubscriptionSnapshot } from "@ipo-singh/contracts";
import { formatIstDate, formatIstDateTime, formatSubscriptionMultiple, isPresentNumber, istDateAnchor } from "@ipo-singh/core";
import { layoutGmpChart, tickLabelFor, type GmpChartLayout, type GmpChartPoint } from "./gmp-chart.ts";

const categoryLabels: Record<string, string> = {
  TOTAL: "Total",
  RETAIL: "Retail",
  QIB: "QIB",
  NII: "NII",
  EMPLOYEE: "Employee",
  SHAREHOLDER: "Shareholder",
  ANCHOR: "Anchor",
  FII: "FII",
  DFI: "DFI",
  MF: "Mutual funds",
  OTHERS: "Others",
  BNII: "bNII",
  BNII_CORP: "bNII corporates",
  BNII_IND: "bNII individuals",
  BNII_OTHERS: "bNII others",
  SNII: "sNII",
  SNII_CORP: "sNII corporates",
  SNII_IND: "sNII individuals",
  SNII_OTHERS: "sNII others",
  CUTOFF: "Cut-off bids",
  PRICE: "Price bids",
};

const headlineKeys = ["TOTAL", "RETAIL", "QIB", "NII", "EMPLOYEE", "SHAREHOLDER", "ANCHOR"] as const;

export type CategoryBar = {
  key: string;
  label: string;
  times: number;
};

export function categoryLabel(key: string): string {
  return categoryLabels[key] ?? key;
}

/** Consecutive bidding days are about 24 hours apart. A missing day is left open. */
export const subscriptionDayGapMs = 36 * 60 * 60 * 1000;

export function subscriptionChartPoints(observations: readonly SubscriptionSnapshot[]): GmpChartPoint[] {
  return observations.flatMap((point) => {
    if (!isPresentNumber(point.totalTimes)) return [];
    const clock = point.observedAt ? new Date(point.observedAt) : null;
    const hasClock = clock instanceof Date && !Number.isNaN(clock.getTime());
    const anchor = point.observedOn ? istDateAnchor(point.observedOn) : null;
    const at = hasClock ? clock.getTime() : anchor?.getTime();
    if (at === undefined || Number.isNaN(at)) return [];
    const when = hasClock ? formatIstDateTime(clock) : formatIstDate(point.observedOn);
    return [
      {
        at,
        amountRupees: point.totalTimes,
        percent: null,
        axisLabel: when,
        tickLabel: tickLabelFor(when, null),
        tooltip: `${when} · ${formatSubscriptionMultiple(point.totalTimes)}`,
        high: false,
        low: false,
      },
    ];
  });
}

export function subscriptionChartLayout(observations: readonly SubscriptionSnapshot[]): GmpChartLayout {
  return layoutGmpChart(subscriptionChartPoints(observations), subscriptionDayGapMs);
}

/**
 * Bars for stored multiples only. A missing category is omitted.
 * A published zero stays, so the chart does not turn a blank into 0x.
 */
export function subscriptionCategoryBars(snapshot: SubscriptionSnapshot | null | undefined): CategoryBar[] {
  if (!snapshot) return [];
  const seen = new Set<string>();
  const bars: CategoryBar[] = [];
  for (const key of headlineKeys) {
    const times = timesFor(snapshot, key);
    if (!isPresentNumber(times)) continue;
    bars.push({ key, label: categoryLabel(key), times });
    seen.add(key);
  }
  for (const category of snapshot.categories ?? []) {
    if (seen.has(category.key) || !isPresentNumber(category.times)) continue;
    bars.push({ key: category.key, label: categoryLabel(category.key), times: category.times });
    seen.add(category.key);
  }
  return bars;
}

function timesFor(snapshot: SubscriptionSnapshot, key: (typeof headlineKeys)[number]): number | null | undefined {
  if (key === "TOTAL") return snapshot.totalTimes;
  const category = snapshot.categories?.find((item) => item.key === key);
  if (category) return category.times;
  if (key === "RETAIL") return snapshot.retailTimes;
  if (key === "QIB") return snapshot.qibTimes;
  if (key === "NII") return snapshot.niiTimes;
  if (key === "EMPLOYEE") return snapshot.employeeTimes;
  if (key === "SHAREHOLDER") return snapshot.shareholderTimes;
  return snapshot.anchorTimes;
}
