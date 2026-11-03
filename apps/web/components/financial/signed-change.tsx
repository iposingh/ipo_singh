import { cn } from "@/lib/cn";
import { changeDirection, directionLabel, formatSignedPercent } from "@ipo-singh/core";

type SignedChangeProps = {
  percent: number | null | undefined;
};

export function SignedChange({ percent }: SignedChangeProps) {
  const direction = changeDirection(percent);
  const text = formatSignedPercent(percent);
  return (
    <span
      className={cn(
        "tabular-nums",
        direction === "positive" ? "text-positive-text" : null,
        direction === "negative" ? "text-negative-text" : null,
        direction === "flat" || direction === "missing" ? "text-muted" : null,
      )}
    >
      <span aria-hidden>
        {direction === "positive" ? "▲ " : null}
        {direction === "negative" ? "▼ " : null}
      </span>
      {text}
      <span className="sr-only"> {directionLabel(direction)}</span>
    </span>
  );
}
