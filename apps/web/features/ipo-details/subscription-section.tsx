import type { Ipo, SubscriptionCategory, SubscriptionSnapshot } from "@ipo-singh/contracts";
import { formatIstDate, formatIstDateTime, isPresentNumber } from "@ipo-singh/core";
import { LastUpdated } from "@/components/financial/ist-date-time";
import { MissingValue } from "@/components/financial/missing-value";
import { SubscriptionMultiple } from "@/components/financial/subscription-multiple";
import { Card } from "@/components/ui/card";
import { DataFreshnessBadge } from "@/components/ui/data-freshness-badge";
import { SectionHeader } from "@/components/ui/section-header";
import { Table, type TableColumn } from "@/components/ui/table";
import { Fact, FactList } from "@/features/ipo-details/fact-list";
import { IpoGuruCreditLink } from "@/features/ipo-details/source-credit-link";
import { isIpoGuruSource } from "@/features/ipo-details/source-credit";
import { CategoryComparisonChart } from "@/features/ipo-details/category-chart";
import { categoryLabel, subscriptionCategoryBars, subscriptionChartPoints, subscriptionDayGapMs } from "@/features/ipo-details/subscription-chart";
import { SubscriptionHistoryChart } from "@/features/ipo-details/subscription-history-chart";

const subscriptionStaleAfterMs = 60 * 60 * 1000;

export function SubscriptionSection({
  ipo,
  history,
  sourceName = null,
  historyRetrievedAt = null,
  historyStatus = "ready",
  now = new Date(),
}: {
  ipo: Ipo | null;
  history: readonly SubscriptionSnapshot[];
  sourceName?: string | null;
  historyRetrievedAt?: string | null;
  historyStatus?: "ready" | "unavailable" | "loading";
  now?: Date;
}) {
  const snapshot = ipo?.subscription ?? null;
  const updatedAt = snapshot?.observedAt ? new Date(snapshot.observedAt) : null;
  const validUpdatedAt = updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null;
  const categories = (snapshot?.categories ?? []).filter((category) => category.key !== "TOTAL");
  const headline = headlineRows(snapshot, categories);
  const retrievedAt = historyRetrievedAt ? new Date(historyRetrievedAt) : null;
  const historyLabel = retrievedAt && !Number.isNaN(retrievedAt.getTime()) ? formatIstDateTime(retrievedAt) : null;
  const categoryBars = subscriptionCategoryBars(snapshot);
  return (
    <section className="grid gap-4" aria-labelledby="ipo-subscription">
      <SectionHeader
        id="ipo-subscription"
        title="Subscription"
        description="Subscription is shown in times subscribed. A missing multiple stays unavailable. A published zero is 0x."
      />
      <Card className="p-0 px-5">
        <FactList>
          <Fact label="Total">
            <span className="text-lg font-semibold">
              <SubscriptionMultiple value={snapshot?.totalTimes} />
            </span>
          </Fact>
          {headline.map((row) => (
            <Fact key={row.key} label={row.label}>
              <div className="grid gap-2">
                <SubscriptionMultiple value={row.times} />
                {row.subcategories.length > 0 ? (
                  <ul className="grid gap-1">
                    {row.subcategories.map((item) => (
                      <li key={item.key} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span className="text-muted">{categoryLabel(item.key)}</span>
                        <SubscriptionMultiple value={item.times} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </Fact>
          ))}
        </FactList>
        <div className="grid gap-2 py-3">
          {validUpdatedAt ? (
            <DataFreshnessBadge updatedAt={validUpdatedAt} now={now} staleAfterMs={subscriptionStaleAfterMs} />
          ) : snapshot?.observedOn ? (
            <p className="text-sm text-muted">Observed on {formatIstDate(snapshot.observedOn)}</p>
          ) : (
            <LastUpdated value={null} />
          )}
          <LastUpdated value={validUpdatedAt} />
          <p className="text-sm text-muted">
            Source: {sourceName ? sourceName : <MissingValue label="Source unavailable" />}
            {isIpoGuruSource(sourceName) ? (
              <>
                {" "}
                <IpoGuruCreditLink />
              </>
            ) : null}
          </p>
          {retrievedAt && !Number.isNaN(retrievedAt.getTime()) ? (
            <p className="text-sm text-muted">History retrieved: {formatIstDateTime(retrievedAt)}</p>
          ) : null}
        </div>
      </Card>
      {categoryBars.length > 0 ? <CategoryComparisonChart bars={categoryBars} /> : null}
      <SubscriptionHistoryChart
        title="Day-wise subscription"
        points={subscriptionChartPoints(history)}
        maxGapMs={subscriptionDayGapMs}
        status={historyStatus}
        sourceName={sourceName}
        updatedLabel={historyLabel}
        emptyDescription="No day-wise subscription history is loaded. Missing days are left blank and are not plotted as zero."
      />
      {historyStatus === "ready" && history.length > 0 ? <HistoryTable rows={history} /> : null}
    </section>
  );
}

function HistoryTable({ rows }: { rows: readonly SubscriptionSnapshot[] }) {
  const columns: TableColumn<SubscriptionSnapshot>[] = [
    {
      id: "day",
      header: "Day",
      cell: (row) => (row.observedOn ? formatIstDate(row.observedOn) : "Unavailable"),
    },
    { id: "total", header: "Total", numeric: true, cell: (row) => <SubscriptionMultiple value={row.totalTimes} /> },
    { id: "qib", header: "QIB", numeric: true, cell: (row) => <SubscriptionMultiple value={row.qibTimes} /> },
    { id: "nii", header: "NII", numeric: true, cell: (row) => <SubscriptionMultiple value={row.niiTimes} /> },
    { id: "retail", header: "Retail", numeric: true, cell: (row) => <SubscriptionMultiple value={row.retailTimes} /> },
  ];
  if (rows.some((row) => supplied(row, "EMPLOYEE", row.employeeTimes))) {
    columns.push({ id: "employee", header: "Employee", numeric: true, cell: (row) => <SubscriptionMultiple value={row.employeeTimes} /> });
  }
  if (rows.some((row) => supplied(row, "SHAREHOLDER", row.shareholderTimes))) {
    columns.push({ id: "shareholder", header: "Shareholder", numeric: true, cell: (row) => <SubscriptionMultiple value={row.shareholderTimes} /> });
  }
  if (rows.some((row) => supplied(row, "ANCHOR", row.anchorTimes))) {
    columns.push({ id: "anchor", header: "Anchor", numeric: true, cell: (row) => <SubscriptionMultiple value={row.anchorTimes} /> });
  }
  return <Table caption="Day-wise subscription history" columns={columns} rows={rows} getRowKey={(row) => `${row.observedOn ?? "day"}-${row.observedAt ?? "none"}-${row.biddingDay ?? "x"}`} />;
}

type Headline = {
  key: string;
  label: string;
  times: number | null | undefined;
  subcategories: SubscriptionCategory["subcategories"];
};

function headlineRows(snapshot: SubscriptionSnapshot | null, categories: readonly SubscriptionCategory[]): Headline[] {
  const preferred = ["RETAIL", "QIB", "NII", "BNII", "SNII", "EMPLOYEE", "SHAREHOLDER", "ANCHOR"] as const;
  return preferred.flatMap((key) => {
    const category = categories.find((item) => item.key === key);
    const times = category ? category.times : flatTimes(snapshot, key);
    // Only show categories with a real multiple. Missing/null stays omitted; published zero still shows as 0x.
    if (typeof times !== "number" || !Number.isFinite(times)) return [];
    return [
      {
        key,
        label: categoryLabel(key),
        times,
        subcategories: (category?.subcategories ?? []).filter((item) => isPresentNumber(item.times) || item.times === 0),
      },
    ];
  });
}

function flatTimes(snapshot: SubscriptionSnapshot | null, key: string): number | null | undefined {
  if (key === "RETAIL") return snapshot?.retailTimes;
  if (key === "QIB") return snapshot?.qibTimes;
  if (key === "NII") return snapshot?.niiTimes;
  if (key === "EMPLOYEE") return snapshot?.employeeTimes;
  if (key === "SHAREHOLDER") return snapshot?.shareholderTimes;
  if (key === "ANCHOR") return snapshot?.anchorTimes;
  return null;
}

function supplied(snapshot: SubscriptionSnapshot | null | undefined, key: string, value: number | null | undefined): boolean {
  if (isPresentNumber(value)) return true;
  return snapshot?.categories?.some((category) => category.key === key) ?? false;
}
