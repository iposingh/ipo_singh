import type { ReactNode } from "react";
import { AppCard } from "./app-card";
import { AppText } from "./app-text";
import { PrimaryButton } from "./primary-button";

export function ErrorState({
  title,
  message,
  action,
  onRetry,
}: {
  title: string;
  message: string;
  action?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <AppCard accessibilityRole="alert" accessibilityLiveRegion="polite">
      <AppText size="sm" weight="semibold" tone="negative">
        Error
      </AppText>
      <AppText weight="semibold">{title}</AppText>
      <AppText tone="muted">{message}</AppText>
      {action}
      {!action && onRetry ? <PrimaryButton label="Try again" onPress={onRetry} /> : null}
    </AppCard>
  );
}
