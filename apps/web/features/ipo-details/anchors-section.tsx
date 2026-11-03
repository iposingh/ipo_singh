import type { Ipo } from "@ipo-singh/contracts";
import { formatSignedPercent, isPresentNumber } from "@ipo-singh/core";
import { MissingValue } from "@/components/financial/missing-value";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Fact, FactList } from "@/features/ipo-details/fact-list";

export function AnchorsSection({ ipo }: { ipo: Ipo | null }) {
  const anchors = ipo?.profile?.anchors;
  if (!anchors || anchors.investors.length === 0) return null;
  return (
    <section className="grid gap-4" aria-labelledby="ipo-anchors">
      <SectionHeader
        id="ipo-anchors"
        title="Anchor allocations"
        description="Anchor investor allocations published for this issue. Amounts are in ₹ crore. Percentages are the figures published by the source."
      />
      <Card className="p-0 px-5">
        <FactList>
          <Fact label="Investors">{anchors.totalCount ?? anchors.investors.length}</Fact>
          <Fact label="Total amount (₹ crore)">{crore(anchors.totalAmountCrore)}</Fact>
          <Fact label="Mutual funds">{anchors.mutualFundCount ?? <MissingValue />}</Fact>
        </FactList>
      </Card>
      <ul className="grid gap-3">
        {anchors.investors.map((investor) => (
          <li key={`${investor.name}-${investor.group ?? "group"}`} className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-sm font-medium text-foreground">{investor.name}</p>
            {investor.group ? <p className="text-sm text-muted">{investor.group}</p> : null}
            <p className="text-sm leading-6 text-foreground">
              {shares(investor.shares)} · {crore(investor.amountCrore)} · Book {formatSignedPercent(investor.allocatedPercent)} · Issue {formatSignedPercent(investor.issuePercent)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function crore(value: number | null): string {
  if (!isPresentNumber(value)) return "Unavailable";
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)} crore`;
}

function shares(value: number | null): string {
  if (!isPresentNumber(value)) return "Shares unavailable";
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)} shares`;
}
