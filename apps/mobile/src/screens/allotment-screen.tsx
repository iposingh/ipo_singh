import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Board, IpoSummary } from "@ipo-singh/contracts";
import { formatIstDate, istCalendarDate } from "@ipo-singh/core";
import { type Href, router } from "expo-router";
import { Linking, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { catalogueClient } from "../catalogue/client";
import { issueRoute } from "../catalogue/routes";
import { listingSections } from "../catalogue/sections";
import { allotmentLink } from "../detail/links";
import { boardLabel } from "../design/copy";
import { screenContentInset } from "../design/layout";
import { useOnReconnect } from "../network/provider";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "../components/app-text";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { LoadingSkeleton } from "../components/loading-skeleton";
import { PrimaryButton } from "../components/primary-button";
import { SectionHeader } from "../components/section-header";
import { SourceAttribution } from "../components/source-attribution";
import { readCatalogueTarget } from "./catalogue-target";

type BoardFilter = "all" | Board;
type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; items: IpoSummary[] };

export function AllotmentScreen() {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const inset = screenContentInset(width);
  const [board, setBoard] = useState<BoardFilter>("all");
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const loadRef = useRef<(force: boolean) => Promise<void>>(async () => undefined);
  const today = istCalendarDate(new Date()) ?? "";

  async function loadAll(id: number, force: boolean) {
    const target = await readCatalogueTarget();
    if (id !== requestId.current) return;
    if ("error" in target) {
      setState({ phase: "error", message: target.error });
      setRefreshing(false);
      return;
    }
    const boards: Board[] = board === "all" ? ["mainboard", "sme"] : [board];
    const pages = await Promise.all(
      boards.map(async (item) => {
        const section = listingSections(item).find((entry) => entry.id === "allotment");
        if (!section) return { status: "unavailable" as const, message: "Allotment listings are unavailable.", cacheNote: null };
        return catalogueClient().loadListing(item, section, undefined, {
          origin: target.origin,
          offline: target.offline,
          force,
        });
      }),
    );
    if (id !== requestId.current) return;
    const failures = pages.filter((page) => page.status !== "ready");
    const items = pages.flatMap((page) => (page.status === "ready" ? page.items : []));
    if (items.length === 0 && failures.length > 0) {
      const first = failures[0];
      setState({
        phase: "error",
        message: first && "message" in first ? first.message : "Allotment listings could not be loaded.",
      });
    } else {
      setState({ phase: "ready", items });
    }
    setRefreshing(false);
  }

  useEffect(() => {
    loadRef.current = (force) => loadAll(requestId.current, force);
  });

  useEffect(() => {
    requestId.current += 1;
    void loadRef.current(false);
  }, [board]);

  const softReload = useCallback(() => {
    requestId.current += 1;
    void loadRef.current(false);
  }, []);

  useOnReconnect(softReload);

  function reload() {
    requestId.current += 1;
    setRefreshing(true);
    void loadRef.current(true);
  }

  const groups = useMemo(() => {
    const items = state.phase === "ready" ? state.items : [];
    return {
      confirmed: items.filter((ipo) => ipo.allotmentConfirmed === true),
      awaiting: items.filter((ipo) => ipo.allotmentConfirmed !== true && (ipo.status === "closed" || ipo.status === "allotment")),
      retrievedAt: items.reduce<string | null>((latest, ipo) => {
        const value = ipo.provenance.retrievedAt;
        if (!value) return latest;
        return !latest || value > latest ? value : latest;
      }, null),
    };
  }, [state]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        width: "100%",
        maxWidth: inset.maxWidth,
        alignSelf: "center",
        gap: mobileTheme.spacing[4],
        paddingTop: inset.paddingTop,
        paddingBottom: inset.paddingBottom + insets.bottom,
        paddingLeft: inset.paddingHorizontal + insets.left,
        paddingRight: inset.paddingHorizontal + insets.right,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={palette.primarySolid} colors={[palette.primarySolid]} />}
    >
      <SectionHeader title="Allotment" description="Allotment out is shown only when a stored result confirms it." />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing[2] }}>
        {(["all", "mainboard", "sme"] as const).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: board === option }}
            onPress={() => {
              if (option === board) return;
              setBoard(option);
              setState({ phase: "loading" });
            }}
            style={{
              minHeight: mobileTheme.sizing.touchTarget,
              justifyContent: "center",
              paddingHorizontal: mobileTheme.spacing[3],
              borderRadius: mobileTheme.radius.md,
              backgroundColor: board === option ? palette.surface : "transparent",
              borderWidth: 1,
              borderColor: board === option ? palette.border : "transparent",
            }}
          >
            <AppText weight="medium">{option === "all" ? "All" : boardLabel(option)}</AppText>
          </Pressable>
        ))}
      </View>
      {state.phase === "loading" ? <LoadingSkeleton label="Loading allotment IPOs" /> : null}
      {state.phase === "error" ? (
        <ErrorState title="Allotment listings could not be loaded" message={state.message} action={<PrimaryButton label="Try again" onPress={reload} />} />
      ) : null}
      {state.phase === "ready" ? (
        <>
          <AllotmentGroup title="Allotment out" empty="No confirmed allotment results are stored." items={groups.confirmed} today={today} confirmed />
          <AllotmentGroup title="Awaiting allotment" empty="No IPOs are waiting on allotment." items={groups.awaiting} today={today} confirmed={false} />
          {groups.confirmed.length + groups.awaiting.length > 0 ? <SourceAttribution retrievedAt={groups.retrievedAt} /> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function AllotmentGroup({
  title,
  empty,
  items,
  today,
  confirmed,
}: {
  title: string;
  empty: string;
  items: readonly IpoSummary[];
  today: string;
  confirmed: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: mobileTheme.spacing[3] }}>
      <SectionHeader title={title} />
      {items.length === 0 ? (
        <EmptyState title={empty} description="" />
      ) : (
        items.map((ipo) => {
          const href = allotmentLink({ name: ipo.registrarName, allotmentUrl: ipo.allotmentUrl });
          const passed = Boolean(ipo.allotmentDate && ipo.allotmentDate < today);
          const route = issueRoute(ipo.slug);
          return (
            <View
              key={ipo.id}
              style={{
                gap: mobileTheme.spacing[2],
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: palette.surface,
                borderRadius: mobileTheme.radius.lg,
                padding: mobileTheme.spacing[4],
              }}
            >
              <AppText size="sm" tone="muted">
                {boardLabel(ipo.board)} · {confirmed ? "Allotment out" : passed ? "Result not confirmed" : "Allotment awaited"}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${ipo.companyName}`}
                onPress={() => {
                  if (route) router.push(route as Href);
                }}
              >
                <AppText weight="semibold" size="lg">
                  {ipo.companyName}
                </AppText>
              </Pressable>
              <AppText size="sm" tone="muted">
                Closes {ipo.closeDate ? formatIstDate(ipo.closeDate) : "Date unavailable"}
              </AppText>
              <AppText size="sm" tone="muted">
                {confirmed ? "Allotment" : "Expected allotment"}{" "}
                {ipo.allotmentDate ? formatIstDate(ipo.allotmentDate) : "Date unavailable"}
              </AppText>
              <AppText size="sm">{ipo.registrarName ?? "Registrar unavailable"}</AppText>
              <PrimaryButton
                label="Check Allotment"
                disabled={!href}
                onPress={() => {
                  if (href) void Linking.openURL(href);
                }}
              />
              <AppText size="sm" tone="muted">
                {href
                  ? confirmed
                    ? "Allotment out. Check Allotment opens the verified official registrar website. Sign-in is not required."
                    : "Results may still be pending. Check Allotment opens the verified official registrar website. Sign-in is not required."
                  : passed && !confirmed
                    ? "The expected allotment date has passed. The result is not confirmed."
                    : "No verified registrar allotment link is stored."}
              </AppText>
            </View>
          );
        })
      )}
    </View>
  );
}
