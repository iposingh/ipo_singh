import { formatPriceBand, isPresentNumber } from "@ipo-singh/core";

type PriceBandProps = {
  lowRupees: number | null | undefined;
  highRupees: number | null | undefined;
};

export function PriceBand({ lowRupees, highRupees }: PriceBandProps) {
  const text = formatPriceBand(lowRupees, highRupees);
  const complete = isPresentNumber(lowRupees) && isPresentNumber(highRupees);
  return (
    <span className={complete ? "tabular-nums text-foreground" : "text-muted"}>
      {text}
      {complete ? <span className="sr-only"> rupees</span> : null}
    </span>
  );
}
