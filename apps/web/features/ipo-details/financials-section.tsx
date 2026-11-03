import type { Ipo } from "@ipo-singh/contracts";
import { InrPrice } from "@/components/financial/inr-price";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { Table, type TableColumn } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { SourceFinancialChart } from "@/features/ipo-details/source-financial-chart";
import { chartableSourceRows, sourceMetricReadings, type SourceMetricGroup } from "@/features/ipo-details/source-financials";
import { Fact, FactList } from "@/features/ipo-details/fact-list";
import { IpoGuruCreditLink } from "@/features/ipo-details/source-credit-link";
import { isIpoGuruSource } from "@/features/ipo-details/source-credit";

type PeriodRow = Ipo["financials"][number];
type SourceRow = NonNullable<Ipo["profile"]>["sourceFinancials"]["rows"][number];

const statementColumns: readonly TableColumn<PeriodRow>[] = [
  { id: "year", header: "Reporting period", cell: (row) => row.fiscalYearLabel },
  { id: "revenue", header: "Revenue (₹)", numeric: true, cell: (row) => <InrPrice value={row.revenueRupees} /> },
  { id: "profit", header: "Profit after tax (₹)", numeric: true, cell: (row) => <InrPrice value={row.profitAfterTaxRupees} /> },
  { id: "eps", header: "Earnings per share (₹)", numeric: true, cell: (row) => <InrPrice value={row.earningsPerShareRupees} /> },
];

const focusOrder: readonly SourceMetricGroup[] = ["assets", "liabilities", "ratios"];

export function FinancialsSection({ ipo }: { ipo: Ipo | null }) {
  const periods = ipo?.financials ?? [];
  const source = ipo?.profile?.sourceFinancials ?? null;
  const rows = source?.rows ?? [];
  const prose = rows.length === 0 ? source?.text ?? null : null;
  const hasSource = rows.length > 0 || Boolean(prose);
  return (
    <section className="grid gap-4" aria-labelledby="ipo-financials">
      <SectionHeader
        id="ipo-financials"
        title="Financials"
        description="Revenue and profit are in rupees for each reporting period. Assets, liabilities, and ratios use the source unit when the statement includes them. Missing figures stay blank."
      />
      {source ? <SourceFocus financials={source} /> : null}
      {rows.length > 0 && source ? <SourceTable financials={source} /> : null}
      {source
        ? chartableSourceRows(source).map((index) => <SourceFinancialChart key={source.rows[index]?.metric ?? index} financials={source} rowIndex={index} />)
        : null}
      {prose ? <p className="max-w-3xl text-sm leading-6 text-foreground">{prose}</p> : null}
      {hasSource && isIpoGuruSource(ipo?.provenance.sourceName) ? (
        <p className="text-sm text-muted">
          <IpoGuruCreditLink />
        </p>
      ) : null}
      {periods.length > 0 ? (
        <Table caption="Structured financial periods" columns={statementColumns} rows={periods} getRowKey={(row) => row.fiscalYearLabel} />
      ) : null}
      {!hasSource && periods.length === 0 ? (
        <EmptyState title="No financials are loaded" description="Revenue, profit, and source tables stay blank when the document does not include them." />
      ) : null}
    </section>
  );
}

function SourceFocus({ financials }: { financials: NonNullable<Ipo["profile"]>["sourceFinancials"] }) {
  const readings = sourceMetricReadings(financials);
  if (readings.length === 0) return null;
  return (
    <Card className="p-0 px-5">
      <FactList>
        {focusOrder.flatMap((group) =>
          readings
            .filter((reading) => reading.group === group)
            .map((reading) => (
              <Fact key={`${reading.group}-${reading.metric}`} label={reading.metric}>
                <span className="tabular-nums">{reading.value}</span>
                {financials.unit ? <span className="text-muted"> {financials.unit}</span> : null}
                <span className="mt-1 block text-muted">{reading.period}</span>
              </Fact>
            )),
        )}
      </FactList>
    </Card>
  );
}

function SourceTable({ financials }: { financials: NonNullable<Ipo["profile"]>["sourceFinancials"] }) {
  const columns: TableColumn<SourceRow>[] = [
    { id: "metric", header: financials.unit ? `Metric (${financials.unit})` : "Metric", cell: (row) => row.metric },
    ...financials.headers.map((header, index) => ({
      id: `period-${index}`,
      header,
      numeric: true as const,
      cell: (row: SourceRow) => row.values[index] || "—",
    })),
  ];
  return <Table caption="Source financial table" columns={columns} rows={financials.rows} getRowKey={(row) => row.metric} />;
}
