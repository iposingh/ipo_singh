import { subscriptionIndicatorCopy } from "../design/copy";
import { AppText } from "./app-text";

export function SubscriptionIndicator({ times }: { times: number | null }) {
  const copy = subscriptionIndicatorCopy(times);
  return (
    <AppText tone={copy.missing ? "muted" : "default"} weight={copy.missing ? "regular" : "semibold"}>
      {copy.missing ? copy.value : `Subscription ${copy.value}`}
    </AppText>
  );
}
