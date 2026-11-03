import type { Ipo } from "@ipo-singh/contracts";
import { formatIstDateTime } from "@ipo-singh/core";
import { SignedChange } from "@/components/financial/signed-change";
import { gmpDisplayFreshness, summarizeGmp } from "@/features/ipos/gmp-summary";

export function CompactGmp({ ipo, now = new Date() }: { ipo: Pick<Ipo, "gmp" | "offer">; now?: Date }) {
  const summary = summarizeGmp({
    gmpAmountRupees: ipo.gmp?.amountRupees,
    issuePriceRupees: ipo.offer.issuePriceRupees,
    priceBandLowRupees: ipo.offer.priceBand.lowRupees,
    priceBandHighRupees: ipo.offer.priceBand.highRupees,
  });
  if (!summary.available) {
    return <span className="text-muted">{summary.text}</span>;
  }
  const freshness = gmpDisplayFreshness(ipo.gmp?.observedAt, now);
  const observed = ipo.gmp?.observedAt ? new Date(ipo.gmp.observedAt) : null;
  return (
    <span>
      <span className="text-muted">GMP* </span>
      <span className="tabular-nums">{summary.amountText}</span>
      {summary.percent === null ? (
        <span className="text-muted"> (percent unavailable)</span>
      ) : (
        <>
          <span> (</span>
          <SignedChange percent={summary.percent} />
          <span>)</span>
        </>
      )}
      {freshness === "stale" && observed && !Number.isNaN(observed.getTime()) ? (
        <span
          className="text-warning-text"
          title="This GMP reading is older than the usual refresh window. The stored value is shown and it is not a live quote."
        >
          {" "}
          Delayed {formatIstDateTime(observed)}
        </span>
      ) : null}
    </span>
  );
}
