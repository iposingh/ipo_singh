import { useCallback, useEffect, useMemo, useState } from "react";
import type { IpoSummary } from "@ipo-singh/contracts";
import { FlatList, Keyboard, Pressable, RefreshControl, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { prepareSearchText } from "../design/copy";
import { screenContentInset } from "../design/layout";
import { warmCatalogueIssue } from "../catalogue/client";
import { issueRoute } from "../catalogue/routes";
import { loadListingsPage } from "../catalogue/load";
import {
  listingsReloadKey,
  listingsSearchDebounceMs,
  listingsSortOptions,
  listingsStatusFilters,
  preparedListingsQuery,
  type ListingsDirection,
  type ListingsQuery,
  type ListingsSort,
  type ListingsStatusFilter,
} from "../discovery/listings-query";
import {
  readListingsSession,
  setListingsBoard,
  setListingsDirection,
  setListingsQueryText,
  setListingsSort,
  setListingsStatus,
} from "../discovery/listings-session";
import { BoardSwitcher } from "../components/board-switcher";
import { CompareBar, CompareToggle, FilterChips } from "../components/discovery-controls";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { IPOCard } from "../components/ipo-card";
import { LoadingSkeleton } from "../components/loading-skeleton";
import { OfflineNotice } from "../components/offline-notice";
import { PrimaryButton } from "../components/primary-button";
import { SearchInput } from "../components/search-input";
import { SectionHeader } from "../components/section-header";
import { SourceAttribution } from "../components/source-attribution";
import { WatchSaveButton } from "../components/watch-save-button";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "../components/app-text";
import { readCatalogueTarget } from "./catalogue-target";
import { usePagedResource } from "./use-paged-resource";

function emptyCopy(query: ListingsQuery): { title: string; description: string } {
  const q = preparedListingsQuery(query.query);
  if (q) {
    return {
      title: `No stored IPOs match ${q}.`,
      description: "Try another company name, board, or status filter.",
    };
  }
  if (query.status === "all") {
    return {
      title: "No IPOs in this board yet.",
      description: "Pull to refresh, or switch Mainboard and SME.",
    };
  }
  return {
    title: `No ${query.status} IPOs right now.`,
    description: "Try All, or switch Mainboard and SME.",
  };
}

export function SearchScreen() {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const inset = screenContentInset(width);
  const [session, setSession] = useState<ListingsQuery>(() => readListingsSession());
  const [draftQuery, setDraftQuery] = useState(() => readListingsSession().query);
  const prepared = prepareSearchText(draftQuery);
  const shortQuery = prepared.status === "short";
  const invalidQuery = prepared.status === "invalid";
  const activeQuery = useMemo(() => ({ ...session, query: draftQuery }), [session, draftQuery]);
  const fetchQuery = useMemo(
    () => ({
      ...session,
      query: preparedListingsQuery(session.query) ? session.query : "",
    }),
    [session],
  );
  const reloadKey = listingsReloadKey(fetchQuery);
  const canFetch = !shortQuery && !invalidQuery;

  const page = usePagedResource(
    (cursor, signal) =>
      readCatalogueTarget().then((target) => {
        if ("error" in target) return { status: "configuration" as const, message: target.error };
        return loadListingsPage(fetchQuery, {
          origin: target.origin,
          offline: target.offline,
          cursor,
          signal,
        });
      }),
    reloadKey,
    canFetch,
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = setListingsQueryText(draftQuery);
      setSession(next);
    }, listingsSearchDebounceMs);
    return () => clearTimeout(timer);
  }, [draftQuery]);

  function patchSession(next: ListingsQuery) {
    setSession(next);
  }

  function onBoardChange(board: ListingsQuery["board"]) {
    patchSession(setListingsBoard(board));
  }

  function onStatusChange(status: ListingsStatusFilter) {
    patchSession(setListingsStatus(status));
  }

  function onSortChange(sort: ListingsSort) {
    patchSession(setListingsSort(sort));
  }

  function onDirectionToggle() {
    const next: ListingsDirection = session.direction === "asc" ? "desc" : "asc";
    patchSession(setListingsDirection(next));
  }

  function clearSearch() {
    setDraftQuery("");
    patchSession(setListingsQueryText(""));
  }

  function submitNow() {
    Keyboard.dismiss();
    const next = setListingsQueryText(draftQuery);
    setSession(next);
  }

  const openIssue = useCallback((ipo: IpoSummary) => {
    const route = issueRoute(ipo.slug);
    if (!route) return;
    warmCatalogueIssue(ipo.slug);
    router.push(route);
  }, []);

  const items = page.state.phase === "ready" ? page.state.items : [];
  const retrievedAt = items
    .map((ipo) => ipo.provenance.retrievedAt)
    .reduce<string | null>((latest, value) => {
      if (!value) return latest;
      return !latest || value > latest ? value : latest;
    }, null);
  const empty = emptyCopy(activeQuery);
  const errorMessage = page.state.phase === "error" ? page.state.message : null;
  const offline = Boolean(errorMessage?.toLowerCase().includes("offline"));

  const header = (
    <View style={{ gap: mobileTheme.spacing[3], marginBottom: mobileTheme.spacing[4] }}>
      <SectionHeader
        title="IPO listings"
        description="Browse Mainboard and SME issues. Search uses stored company names. Filters and sort run on the IPO Singh API."
      />
      <BoardSwitcher board={session.board} onChange={onBoardChange} />
      <SearchInput
        label="Company name"
        value={draftQuery}
        onChangeText={setDraftQuery}
        onSubmit={submitNow}
        placeholder="Company name"
      />
      {draftQuery.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={clearSearch}
          style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
        >
          <AppText weight="medium" style={{ color: palette.link }}>
            Clear search
          </AppText>
        </Pressable>
      ) : null}
      <FilterChips label="Status" value={session.status} onChange={onStatusChange} options={listingsStatusFilters} />
      <FilterChips label="Sort by" value={session.sort} onChange={onSortChange} options={listingsSortOptions} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={session.direction === "asc" ? "Sort ascending" : "Sort descending"}
        onPress={onDirectionToggle}
        style={{
          alignSelf: "flex-start",
          minHeight: mobileTheme.sizing.touchTarget,
          justifyContent: "center",
          paddingHorizontal: mobileTheme.spacing[3],
          borderRadius: mobileTheme.radius.full,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.surface,
        }}
      >
        <AppText size="sm" weight="medium">
          {session.direction === "asc" ? "Ascending dates" : "Descending dates"}
        </AppText>
      </Pressable>
      {session.status === "allotment" ? (
        <AppText size="sm" tone="muted">
          Allotment includes closed issues awaiting result and issues with allotment out. Cards keep those labels distinct.
        </AppText>
      ) : null}
      {shortQuery ? <EmptyState title="Keep typing." description="Search uses at least 2 characters. Clear the field to browse the full list." /> : null}
      {invalidQuery ? <EmptyState title="That search cannot be sent." description="Remove unsupported characters and try again." /> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <FlatList
        style={{ flex: 1, backgroundColor: palette.background }}
        data={canFetch && page.state.phase === "ready" ? items : []}
        keyExtractor={(item) => item.id}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          canFetch ? (
            <RefreshControl
              refreshing={page.state.phase === "loading"}
              onRefresh={page.reload}
              tintColor={palette.primarySolid}
              colors={[palette.primarySolid]}
            />
          ) : undefined
        }
        contentContainerStyle={{
          flexGrow: 1,
          width: "100%",
          maxWidth: inset.maxWidth,
          alignSelf: "center",
          paddingTop: inset.paddingTop,
          paddingBottom: inset.paddingBottom + insets.bottom,
          paddingLeft: inset.paddingHorizontal + insets.left,
          paddingRight: inset.paddingHorizontal + insets.right,
        }}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={{ marginBottom: mobileTheme.spacing[4], gap: mobileTheme.spacing[2] }}>
            <IPOCard
              ipo={item}
              mode={item.status === "listed" ? "listed" : "active"}
              onPress={() => openIssue(item)}
            />
            <WatchSaveButton ipo={item} />
            <CompareToggle slug={item.slug} />
          </View>
        )}
        ListEmptyComponent={
          !canFetch ? undefined : page.state.phase === "loading" || page.state.phase === "idle" ? (
            <LoadingSkeleton label="Loading IPO listings" />
          ) : page.state.phase === "error" ? (
            offline ? (
              <OfflineNotice message={errorMessage ?? undefined} onRetry={page.reload} />
            ) : (
              <ErrorState title="Listings could not be loaded" message={errorMessage ?? "The IPO Singh API is unavailable."} onRetry={page.reload} />
            )
          ) : (
            <EmptyState title={empty.title} description={empty.description} />
          )
        }
        ListFooterComponent={
          page.state.phase === "ready" ? (
            <View style={{ gap: mobileTheme.spacing[3], paddingBottom: mobileTheme.spacing[4] }}>
              {page.state.moreError ? (
                <ErrorState title="More issues could not be loaded" message={page.state.moreError} onRetry={page.loadMore} />
              ) : null}
              {page.state.nextCursor ? (
                <PrimaryButton
                  label={page.state.moreError ? "Try again" : "Load more"}
                  loading={page.state.loadingMore}
                  onPress={page.loadMore}
                />
              ) : null}
              {page.state.items.length > 0 ? <SourceAttribution retrievedAt={retrievedAt} /> : null}
            </View>
          ) : undefined
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (page.state.phase === "ready" && page.state.nextCursor && !page.state.loadingMore) page.loadMore();
        }}
      />
      <CompareBar />
    </View>
  );
}
