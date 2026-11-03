import { InrPrice } from "@/components/financial/inr-price";
import { SignedChange } from "@/components/financial/signed-change";
import { isPresentNumber } from "@ipo-singh/core";

type GmpDisplayProps = {
  amountRupees: number | null | undefined;
  percent: number | null | undefined;
};

export function GmpDisplay({ amountRupees, percent }: GmpDisplayProps) {
  const amountMissing = !isPresentNumber(amountRupees);
  const percentMissing = !isPresentNumber(percent);

  if (amountMissing && percentMissing) {
    return <span className="text-muted">GMP unavailable</span>;
  }

  return (
    <span className="text-foreground">
      {amountMissing ? <span className="text-muted">Amount unavailable</span> : <InrPrice value={amountRupees} />}
      <span> (</span>
      {percentMissing ? <span className="text-muted">percent unavailable</span> : <SignedChange percent={percent} />}
      <span>)</span>
    </span>
  );
}
