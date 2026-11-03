import { memo, useCallback } from "react";
import type { Board, IpoSummary } from "@ipo-singh/contracts";
import { router } from "expo-router";
import { RefreshControl, SectionList, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { warmCatalogueIssue } from "../catalogue/client";
import { dashboardCounts } from "../catalogue/dashboard-counts";
import { issueRoute } from "../catalogue/routes";
import { listingSections, type ListingSectionId } from "../catalogue/sections";
import type { BoardSectionState } from "../catalogue/board-state";
import { boardLabel } from "../design/copy";
import { screenContentInset } from "../design/layout";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";
import { BoardSwitcher } from "./board-switcher";
import { DashboardSummary } from "./dashboard-summary";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { IPOCard } from "./ipo-card";
import { LoadingSkeleton } from "./loading-skeleton";
import { OfflineNotice } from "./offline-notice";
import { PrimaryButton } from "./primary-button";
import { PromotionCarousel } from "./promotion-carousel";
import { SectionHeader } from "./section-header";
import { SourceAttribution } from "./source-attribution";
import { WatchSaveButton } from "./watch-save-button";

type Row = IpoSummary;

type ListSection = {
  id: ListingSectionId;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  phase: BoardSectionState["phase"];
  message: string | null;
  nextCursor: string | null;
  loadingMore: boolean;
  moreError: string | null;
  data: IpoSummary[];
};

export function ListingList({
  board,
  sections,
  refreshing,
  notice,
  onRefresh,
  onLoadMore,
  onBoardChange,
}: {
  board: Board;
  sections: readonly BoardSectionState[];
  refreshing: boolean;
  notice: string | null;
  onRefresh: () => void;
  onLoadMore: (id: ListingSectionId) => void;
  /** When set, the home dashboard shows Mainboard / SME switching. */
  onBoardChange?: (board: Board) => void;
}) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const inset = screenContentInset(width);
  const counts = dashboardCounts(sections);
  const listSections: ListSection[] = listingSections(board).map((section) => {
    const state = sections.find((item) => item.id === section.id);
    return {
      id: section.id,
      title: section.title,
      description: section.description,
      emptyTitle: section.emptyTitle,
      emptyDescription: section.emptyDescription,
      phase: state?.phase ?? "loading",
      message: state?.message ?? null,
      nextCursor: state?.nextCursor ?? null,
      loadingMore: state?.loadingMore ?? false,
      moreError: state?.moreError ?? null,
      data: state?.items ?? [],
    };
  });
  const retrievedAt = listSections
    .flatMap((section) => section.data.map((ipo) => ipo.provenance.retrievedAt))
    .reduce<string | null>((latest, value) => {
      if (!value) return latest;
      return !latest || value > latest ? value : latest;
    }, null);

  return (
    <SectionList<Row, ListSection>
      style={{ flex: 1, backgroundColor: palette.background }}
      sections={listSections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      initialNumToRender={6}
      maxToRenderPerBatch={4}
      updateCellsBatchingPeriod={50}
      windowSize={5}
      /** Android clipping while navigating to IPO detail has crashed release builds with nested Pressables. */
      removeClippedSubviews={false}
      contentInsetAdjustmentBehavior="never"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primarySolid} colors={[palette.primarySolid]} />}
      contentContainerStyle={{
        width: "100%",
        maxWidth: inset.maxWidth,
        alignSelf: "center",
        paddingTop: inset.paddingTop,
        paddingBottom: inset.paddingBottom + insets.bottom,
        paddingLeft: inset.paddingHorizontal + insets.left,
        paddingRight: inset.paddingHorizontal + insets.right,
      }}
      ListHeaderComponent={
        <View style={{ gap: mobileTheme.spacing[3], marginBottom: mobileTheme.spacing[4] }}>
          <SectionHeader
            title="IPO Singh"
            description={`${boardLabel(board)} IPO dashboard. Figures come from the IPO Singh API.`}
          />
          {onBoardChange ? <BoardSwitcher board={board} onChange={onBoardChange} /> : null}
          <DashboardSummary counts={counts} />
          <PromotionCarousel refreshing={refreshing} />
          {notice ? (
            notice.toLowerCase().includes("offline") ? (
              <OfflineNotice message={notice} onRetry={onRefresh} />
            ) : (
              <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">
                {notice}
              </AppText>
            )
          ) : null}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={{ marginTop: mobileTheme.spacing[2], marginBottom: mobileTheme.spacing[3] }}>
          <SectionHeader title={section.title} description={section.description} />
        </View>
      )}
      renderItem={({ item, section }) => <ListingRow item={item} listed={section.id === "listed"} />}
      renderSectionFooter={({ section }) => (
        <View style={{ gap: mobileTheme.spacing[3], marginBottom: mobileTheme.spacing[6] }}>
          {section.phase === "loading" ? <LoadingSkeleton label={`Loading ${section.title}`} /> : null}
          {section.phase === "error" ? (
            <ErrorState
              title="Issues could not be loaded"
              message={section.message ?? "The IPO Singh API is unavailable."}
              onRetry={onRefresh}
            />
          ) : null}
          {section.phase === "ready" && section.data.length === 0 ? (
            <EmptyState title={section.emptyTitle} description={section.emptyDescription} />
          ) : null}
          {section.moreError ? <ErrorState title="More issues could not be loaded" message={section.moreError} onRetry={() => onLoadMore(section.id)} /> : null}
          {section.nextCursor ? (
            <PrimaryButton
              label={section.moreError ? "Try again" : "Load more"}
              loading={section.loadingMore}
              onPress={() => onLoadMore(section.id)}
            />
          ) : null}
        </View>
      )}
      ListFooterComponent={listSections.some((section) => section.data.length > 0) ? <SourceAttribution retrievedAt={retrievedAt} /> : undefined}
    />
  );
}

const ListingRow = memo(function ListingRow({ item, listed }: { item: IpoSummary; listed: boolean }) {
  const onPress = useCallback(() => {
    const route = issueRoute(item.slug);
    if (!route) return;
    warmCatalogueIssue(item.slug);
    try {
      router.push(route);
    } catch {
      // Expo Router should not throw; keep the list alive if navigation fails.
    }
  }, [item.slug]);
  return (
    <View style={{ marginBottom: mobileTheme.spacing[4], gap: mobileTheme.spacing[2] }}>
      <IPOCard ipo={item} mode={listed ? "listed" : "active"} hideBoard onPress={onPress} />
      <WatchSaveButton ipo={item} />
    </View>
  );
});
