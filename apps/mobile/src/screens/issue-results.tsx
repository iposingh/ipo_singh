import type { ReactNode } from "react";
import type { IpoSummary } from "@ipo-singh/contracts";
import { View } from "react-native";
import { mobileTheme } from "../theme/theme";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { IPOCard } from "../components/ipo-card";
import { LoadingSkeleton } from "../components/loading-skeleton";
import { PrimaryButton } from "../components/primary-button";
import type { PagedState } from "./use-paged-resource";

export function IssueResults({
  state,
  emptyTitle,
  emptyDescription,
  onRetry,
  onLoadMore,
  onOpen,
  extra,
  loadingLabel = "Loading IPOs",
  errorTitle = "Issues could not be loaded",
}: {
  state: PagedState<IpoSummary>;
  emptyTitle: string;
  emptyDescription: string;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpen?: (ipo: IpoSummary) => void;
  extra?: (ipo: IpoSummary) => ReactNode;
  loadingLabel?: string;
  errorTitle?: string;
}) {
  if (state.phase === "idle" || state.phase === "loading") return <LoadingSkeleton label={loadingLabel} />;
  if (state.phase === "error") {
    return <ErrorState title={errorTitle} message={state.message} action={<PrimaryButton label="Try again" onPress={onRetry} />} />;
  }
  return (
    <View style={{ gap: mobileTheme.spacing[4] }}>
      {state.items.length === 0 ? <EmptyState title={emptyTitle} description={emptyDescription} /> : state.items.map((ipo) => (
        <View key={ipo.id} style={{ gap: mobileTheme.spacing[2] }}>
          <IPOCard ipo={ipo} onPress={onOpen ? () => onOpen(ipo) : undefined} />
          {extra?.(ipo)}
        </View>
      ))}
      {state.moreError ? <ErrorState title="More issues could not be loaded" message={state.moreError} /> : null}
      {state.nextCursor ? <PrimaryButton label={state.moreError ? "Try again" : "Load more"} loading={state.loadingMore} onPress={onLoadMore} /> : null}
    </View>
  );
}
