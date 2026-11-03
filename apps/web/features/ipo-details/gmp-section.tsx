import type { GmpHistoryWindow, GmpObservation, Ipo } from "@ipo-singh/contracts";
import { formatInr, formatIstDateTime, indicativeGmpDisclaimer, unofficialGmpDisclaimer } from "@ipo-singh/core";
import { IstDateTime } from "@/components/financial/ist-date-time";
import { SignedChange } from "@/components/financial/signed-change";
import { Card } from "@/components/ui/card";
import { DataFreshnessBadge } from "@/components/ui/data-freshness-badge";
import { SectionHeader } from "@/components/ui/section-header";
import { Fact, FactList } from "@/features/ipo-details/fact-list";
import { dailyGmpPoints, dailyMaxGapMs, intradayGmpPoints, intradayMaxGapMs } from "@/features/ipo-details/gmp-chart";
import { GmpHistoryChart } from "@/features/ipo-details/gmp-history-chart";
import { IpoGuruCreditLink } from "@/features/ipo-details/source-credit-link";
import { isIpoGuruSource } from "@/features/ipo-details/source-credit";
import { gmpDisplayStaleAfterMs, impliedGmpPrice, summarizeGmp } from "@/features/ipos/gmp-summary";
import { MissingValue } from "@/components/financial/missing-value";

export function GmpSection({
  ipo,
  history,
  sourceName = null,
  historyRetrievedAt = null,
  historyWindow = null,
  historyStatus = "ready",
  now = new Date(),
}: {
  ipo: Ipo | null;
  history: readonly GmpObservation[];
  sourceName?: string | null;
  historyRetrievedAt?: string | null;
  historyWindow?: GmpHistoryWindow | null;
  historyStatus?: "ready" | "unavailable" | "loading";
  now?: Date;
}) {
  const summary = ipo
    ? summarizeGmp({
        gmpAmountRupees: ipo.gmp?.amountRupees,
        issuePriceRupees: ipo.offer.issuePriceRupees,
        priceBandLowRupees: ipo.offer.priceBand.lowRupees,
        priceBandHighRupees: ipo.offer.priceBand.highRupees,
      })
    : { available: false as const, text: "GMP unavailable" as const };
  const implied = ipo
    ? impliedGmpPrice({
        gmpAmountRupees: ipo.gmp?.amountRupees,
        issuePriceRupees: ipo.offer.issuePriceRupees,
        priceBandLowRupees: ipo.offer.priceBand.lowRupees,
        priceBandHighRupees: ipo.offer.priceBand.highRupees,
      })
    : null;
  const updatedAt = ipo?.gmp?.observedAt ? new Date(ipo.gmp.observedAt) : null;
  const historyClock = historyRetrievedAt ? new Date(historyRetrievedAt) : null;
  const historyLabel = historyClock && !Number.isNaN(historyClock.getTime()) ? formatIstDateTime(historyClock) : null;

  return (
    <section className="grid gap-4" aria-labelledby="ipo-gmp">
      <SectionHeader
        id="ipo-gmp"
        title="GMP*"
        description="Current premium in rupees, the derived percentage, and the indicative price. History shows observed readings only. A missing premium is unavailable, not ₹0."
      />
      <Card className="p-0 px-5">
        <FactList>
          <Fact label="Current GMP*">
            {summary.available ? <span className="tabular-nums">{summary.amountText}</span> : <span className="text-muted">{summary.text}</span>}
          </Fact>
          <Fact label="GMP percentage">
            {summary.available && summary.percent !== null ? <SignedChange percent={summary.percent} /> : <MissingValue label="Percent unavailable" />}
          </Fact>
          <Fact label="Indicative listing price">
            {implied ? (
              <span>
                <span className="tabular-nums">{formatInr(implied.rupees)}</span>
                <span className="mt-1 block text-muted">{implied.disclaimer}</span>
              </span>
            ) : (
              <MissingValue label="Indicative price unavailable" />
            )}
          </Fact>
          <Fact label="Source">
            {sourceName ? (
              <span>
                {sourceName}
                {isIpoGuruSource(sourceName) ? (
                  <>
                    {" "}
                    <IpoGuruCreditLink />
                  </>
                ) : null}
              </span>
            ) : (
              <MissingValue label="Source unavailable" />
            )}
          </Fact>
          <Fact label="Last updated">
            <DataFreshnessBadge updatedAt={updatedAt} now={now} staleAfterMs={gmpDisplayStaleAfterMs} />
          </Fact>
          <Fact label="History retrieved">
            {historyStatus === "ready" && historyRetrievedAt ? (
              <IstDateTime value={new Date(historyRetrievedAt)} />
            ) : (
              <MissingValue label="History time unavailable" />
            )}
          </Fact>
        </FactList>
        <p className="py-3 text-sm leading-6 text-muted">{unofficialGmpDisclaimer}</p>
        <p className="pb-3 text-sm text-muted">{indicativeGmpDisclaimer}</p>
      </Card>
      {historyWindow?.truncated ? (
        <p className="text-sm text-muted">This history is partial. Older days were not included.</p>
      ) : null}
      <GmpHistoryChart
        title="Daily GMP (₹)"
        points={dailyGmpPoints(history, historyWindow)}
        maxGapMs={dailyMaxGapMs}
        status={historyStatus}
        window={historyWindow}
        sourceName={sourceName}
        updatedLabel={historyLabel}
        emptyDescription="No daily GMP history is loaded. Missing days are left blank and are not plotted as zero."
      />
      <GmpHistoryChart
        title="Intraday GMP (₹)"
        points={intradayGmpPoints(history, historyWindow)}
        maxGapMs={intradayMaxGapMs}
        status={historyStatus}
        window={historyWindow}
        sourceName={sourceName}
        updatedLabel={historyLabel}
        emptyDescription={
          historyWindow?.timelineLocked
            ? "Intraday GMP is not included for this source plan. No sample points were added."
            : "No intraday GMP history is loaded. Missing slots are not filled in."
        }
      />
    </section>
  );
}
