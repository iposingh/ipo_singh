import { useState } from "react";
import { defaultAccountPreferences, type WatchlistItem } from "@ipo-singh/contracts";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useAuth } from "../auth/provider";
import { warmCatalogueIssue } from "../catalogue/client";
import { issueRoute } from "../catalogue/routes";
import { AppText } from "../components/app-text";
import { FilterChips } from "../components/discovery-controls";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { IPOCard } from "../components/ipo-card";
import { LoadingSkeleton } from "../components/loading-skeleton";
import { PrimaryButton } from "../components/primary-button";
import { ScreenContainer } from "../components/screen-container";
import { SectionHeader } from "../components/section-header";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { guestWatchlistSupported } from "../watchlist/cache";
import { visibleWatchlist, type WatchlistBoard } from "../watchlist/list";
import { useWatchlist } from "../watchlist/provider";

const filters: readonly { value: WatchlistBoard; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mainboard", label: "Mainboard" },
  { value: "sme", label: "SME" },
];

function openSaved(item: WatchlistItem) {
  const slug = item.ipo?.slug;
  if (!slug) return;
  const route = issueRoute(slug);
  if (!route) return;
  warmCatalogueIssue(slug);
  router.push(route);
}

export function WatchlistScreen() {
  const { palette } = useTheme();
  const { state } = useAuth();
  const watchlist = useWatchlist();
  const preferred = state.phase === "ready" ? state.snapshot.account.preferences.defaultBoard : null;
  const display = state.phase === "ready" ? state.snapshot.account.preferences.watchlistDisplay : defaultAccountPreferences.watchlistDisplay;
  const [chosen, setChosen] = useState<WatchlistBoard | null>(null);
  const board = chosen ?? preferred ?? "all";
  const visible = visibleWatchlist(watchlist.items, board);
  const gap = display.density === "compact" ? mobileTheme.spacing[2] : mobileTheme.spacing[4];

  return (
    <ScreenContainer refreshing={watchlist.refreshing} onRefresh={() => { void watchlist.reload(); }}>
      <SectionHeader
        title="Watchlist"
        description="Saved issues for this account. The same list is used on the website. A guest device does not keep a local watchlist; after sign-in the account list loads from the IPO Singh API and is cached on this phone for offline restarts."
      />
      {watchlist.status === "loading" ? <LoadingSkeleton label="Loading your watchlist" /> : null}
      {watchlist.status === "guest" ? (
        <View style={{ gap: mobileTheme.spacing[3] }}>
          <EmptyState
            title="Sign in to save IPOs"
            description={
              guestWatchlistSupported
                ? "Browsing stays open without an account."
                : "Browsing stays open without an account. Guest watchlists are not stored on this device, so nothing is merged on login. Global allotment phone reminders do not need a watchlisted IPO."
            }
          />
          <PrimaryButton label="Go to Settings" onPress={() => router.push("/(tabs)/settings")} />
        </View>
      ) : null}
      {watchlist.status === "offline" ? (
        <EmptyState title="The watchlist could not be loaded." description={watchlist.notice ?? "The watchlist could not be loaded while offline."} />
      ) : null}
      {watchlist.status === "error" ? (
        <ErrorState title="Watchlist unavailable" message={watchlist.notice ?? "Your saved issues could not be loaded."} action={<PrimaryButton label="Try again" onPress={() => { void watchlist.reload(); }} />} />
      ) : null}
      {watchlist.status === "ready" ? (
        <View style={{ gap }}>
          {watchlist.notice ? <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">{watchlist.notice}</AppText> : null}
          {chosen === null && preferred ? (
            <AppText size="sm" tone="muted">{preferred === "sme" ? "Showing the SME default from this account." : "Showing the Mainboard default from this account."}</AppText>
          ) : null}
          <FilterChips label="IPO category" value={board} options={filters} onChange={setChosen} />
          {watchlist.items.length === 0 ? (
            <EmptyState title="No saved IPOs" description="Use Save on an IPO. The watchlist stores the IPO id, then reads the current catalogue." />
          ) : null}
          {watchlist.items.length > 0 && visible.length === 0 ? (
            <EmptyState
              title={board === "sme" ? "No saved SME IPOs" : "No saved Mainboard IPOs"}
              description="Saved IPOs from the other category, and IPOs that are not stored, stay on All."
            />
          ) : null}
          {visible.map((item) => (
            <View key={item.ipoId} style={{ gap: mobileTheme.spacing[2] }}>
              {item.ipo ? (
                <IPOCard ipo={item.ipo} onPress={() => openSaved(item)} />
              ) : (
                <View style={{ gap: mobileTheme.spacing[2], padding: mobileTheme.spacing[3], borderWidth: 1, borderColor: palette.border, borderRadius: mobileTheme.radius.md }}>
                  <AppText weight="semibold">This IPO is not in the stored catalogue.</AppText>
                  <AppText size="sm" tone="muted">The saved id remains until you remove it. No company or price is invented.</AppText>
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.ipo ? `Remove ${item.ipo.companyName}` : "Remove this saved IPO"}
                onPress={() => { void (item.ipo ? watchlist.toggle(item.ipo) : watchlist.remove(item.ipoId)); }}
                style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
              >
                <AppText weight="medium" style={{ color: palette.link }}>Remove</AppText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}
