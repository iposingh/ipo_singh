import { useCallback, useEffect, useRef, useState } from "react";
import { stableIdSchema, type Ipo } from "@ipo-singh/contracts";
import { View } from "react-native";
import { MobileApiError } from "../api/errors";
import { catalogueClient, historyClient } from "../catalogue/client";
import { fallbackHistoryNote, offlineHistoryNote, type ChartPhase, type GmpHistoryDocument, type HistoryLoad, type SubscriptionHistoryDocument } from "../catalogue/history";
import { fallbackCacheNote, offlineCacheNote } from "../catalogue/response-cache";
import { AppHeader } from "../components/app-header";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { IpoDetailView } from "../components/ipo-detail-view";
import { LoadingSkeleton } from "../components/loading-skeleton";
import { PrimaryButton } from "../components/primary-button";
import { ScreenContainer } from "../components/screen-container";
import { useOnReconnect } from "../network/provider";
import { useTheme } from "../theme/provider";
import { readCatalogueTarget } from "./catalogue-target";

type DetailState =
  | { phase: "loading" }
  | { phase: "ready"; ipo: Ipo; notice: string | null }
  | { phase: "missing" }
  | { phase: "error"; message: string };

function noticeFor(reason: "fresh" | "offline" | "fallback" | null, cacheNote: string | null): string | null {
  if (reason === "offline") return offlineCacheNote;
  if (reason === "fallback") return fallbackCacheNote;
  return cacheNote;
}

function historyNotice<T>(loaded: Extract<HistoryLoad<T>, { status: "ready" }>): string | null {
  if (loaded.cacheReason === "offline") return offlineHistoryNote;
  if (loaded.cacheReason === "fallback") return loaded.cacheNote ?? fallbackHistoryNote;
  return loaded.cacheNote;
}

function nextChartPhase<T>(loaded: HistoryLoad<T>, current: ChartPhase<T>, keepReady: boolean): ChartPhase<T> {
  if (loaded.status === "ready") return { phase: "ready", value: loaded.value, notice: historyNotice(loaded) };
  if (keepReady && current.phase === "ready") return { ...current, notice: loaded.message };
  return { phase: "unavailable", message: loaded.message };
}

export function IpoDetailScreen({ slug }: { slug: string }) {
  const { palette } = useTheme();
  const valid = stableIdSchema.safeParse(slug).success;
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<DetailState>({ phase: "loading" });
  const [gmpHistory, setGmpHistory] = useState<ChartPhase<GmpHistoryDocument>>({ phase: "loading" });
  const [subscriptionHistory, setSubscriptionHistory] = useState<ChartPhase<SubscriptionHistoryDocument>>({ phase: "loading" });
  const stateRef = useRef(state);
  const forceRef = useRef(false);
  const softRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    if (!valid) return;
    const force = forceRef.current;
    const soft = softRef.current;
    forceRef.current = false;
    softRef.current = false;
    const keepReady = force || soft;
    if (!force && !soft) {
      setGmpHistory({ phase: "loading" });
      setSubscriptionHistory({ phase: "loading" });
    }
    const controller = new AbortController();
    void (async () => {
      const target = await readCatalogueTarget();
      if (controller.signal.aborted) return;
      if ("error" in target) {
        setRefreshing(false);
        if (keepReady && stateRef.current.phase === "ready") {
          setState({ ...stateRef.current, notice: target.error });
          return;
        }
        setState({ phase: "error", message: target.error });
        setGmpHistory((current) => nextChartPhase({ status: "unavailable", message: target.error, cacheNote: null }, current, keepReady));
        setSubscriptionHistory((current) => nextChartPhase({ status: "unavailable", message: target.error, cacheNote: null }, current, keepReady));
        return;
      }
      const request = { origin: target.origin, offline: target.offline, force, signal: controller.signal };
      let loadHistory = false;
      try {
        // Issue first so the detail shell paints before history bandwidth competes on slow links.
        const loaded = await catalogueClient().loadIssue(slug, request);
        if (controller.signal.aborted) return;
        setRefreshing(false);
        if (loaded.status === "ready") {
          setState({ phase: "ready", ipo: loaded.ipo, notice: noticeFor(loaded.cacheReason, loaded.cacheNote) });
          loadHistory = true;
        } else if (loaded.status === "missing") {
          setState({ phase: "missing" });
        } else if (keepReady && stateRef.current.phase === "ready") {
          setState({ ...stateRef.current, notice: loaded.message });
          loadHistory = true;
        } else {
          setState({ phase: "error", message: loaded.message });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof MobileApiError && error.kind === "cancelled") return;
        setRefreshing(false);
        if (keepReady && stateRef.current.phase === "ready") {
          setState({ ...stateRef.current, notice: "The IPO could not be refreshed." });
          loadHistory = true;
        } else {
          setState({ phase: "error", message: "The IPO could not be loaded." });
        }
      }
      if (!loadHistory) {
        setGmpHistory((current) => nextChartPhase({ status: "unavailable", message: "History is unavailable for this IPO.", cacheNote: null }, current, keepReady));
        setSubscriptionHistory((current) =>
          nextChartPhase({ status: "unavailable", message: "History is unavailable for this IPO.", cacheNote: null }, current, keepReady),
        );
        return;
      }
      try {
        const [gmp, subscription] = await Promise.all([
          historyClient().loadGmpHistory(slug, request),
          historyClient().loadSubscriptionHistory(slug, request),
        ]);
        if (controller.signal.aborted) return;
        setGmpHistory((current) => nextChartPhase(gmp, current, keepReady));
        setSubscriptionHistory((current) => nextChartPhase(subscription, current, keepReady));
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof MobileApiError && error.kind === "cancelled") return;
        const message = "The history could not be loaded.";
        setGmpHistory((current) => nextChartPhase({ status: "unavailable", message, cacheNote: null }, current, keepReady));
        setSubscriptionHistory((current) => nextChartPhase({ status: "unavailable", message, cacheNote: null }, current, keepReady));
      }
    })();
    return () => controller.abort();
  }, [attempt, slug, valid]);

  function reload() {
    forceRef.current = true;
    setRefreshing(true);
    setAttempt((value) => value + 1);
  }

  const softReload = useCallback(() => {
    // Soft recovery: reuse fresh device cache, hit the network only when stale.
    forceRef.current = false;
    softRef.current = true;
    setAttempt((value) => value + 1);
  }, []);

  useOnReconnect(softReload);

  const title = state.phase === "ready" ? state.ipo.companyName : "IPO";

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <AppHeader title={title} showSearch={false} />
      {valid && state.phase === "ready" ? (
          <IpoDetailView
            ipo={state.ipo}
            notice={state.notice}
            refreshing={refreshing}
            onRefresh={reload}
            gmpHistory={gmpHistory}
            subscriptionHistory={subscriptionHistory}
          />
        ) : (
          <ScreenContainer safeBottom refreshing={refreshing} onRefresh={valid ? reload : undefined}>
            {!valid ? <ErrorState title="This IPO address is not valid." message="The link does not match a stored IPO." /> : null}
            {valid && state.phase === "loading" ? <LoadingSkeleton label="Loading the IPO" /> : null}
            {valid && state.phase === "missing" ? (
              <EmptyState title="This IPO is not stored." description="The app does not add a sample company." />
            ) : null}
            {valid && state.phase === "error" ? (
              <ErrorState title="The IPO could not be loaded" message={state.message} action={<PrimaryButton label="Try again" onPress={reload} />} />
            ) : null}
          </ScreenContainer>
        )}
    </View>
  );
}
