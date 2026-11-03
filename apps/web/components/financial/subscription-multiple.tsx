import { formatSubscriptionMultiple, isPresentNumber } from "@ipo-singh/core";

type SubscriptionMultipleProps = {
  value: number | null | undefined;
};

export function SubscriptionMultiple({ value }: SubscriptionMultipleProps) {
  const text = formatSubscriptionMultiple(value);
  if (!isPresentNumber(value)) {
    return <span className="text-muted">{text}</span>;
  }
  return (
    <span className="tabular-nums text-foreground">
      {text}
      <span className="sr-only"> subscribed</span>
    </span>
  );
}
