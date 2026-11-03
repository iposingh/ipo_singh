import { formatInr } from "@ipo-singh/core";
import { cn } from "@/lib/cn";

type InrPriceProps = {
  value: number | null | undefined;
};

export function InrPrice({ value }: InrPriceProps) {
  const text = formatInr(value);
  return (
    <span className={cn("tabular-nums", text === "Unavailable" ? "text-muted" : "text-foreground")}>
      {text}
    </span>
  );
}
