import { useEffect, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { MobileApiError } from "../api/errors";
import { catalogueClient } from "../catalogue/client";
import { issueRoute } from "../catalogue/routes";
import { AppText } from "../components/app-text";
import { EmptyState } from "../components/empty-state";
import { LoadingSkeleton } from "../components/loading-skeleton";
import { PrimaryButton } from "../components/primary-button";
import { ScreenContainer } from "../components/screen-container";
import { SectionHeader } from "../components/section-header";
import { compareNote, compareTable, type CompareColumn } from "../discovery/compare";
import { useCompareSelection } from "../discovery/compare-selection";
import { canCompare, compareColumnWidth } from "../discovery/selection";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { readCatalogueTarget } from "./catalogue-target";

type LoadedColumn = CompareColumn | { state: "loading"; slug: string } | { state: "error"; slug: string; message: string };

function openIssue(slug: string) {
  const route = issueRoute(slug);
  if (route) router.push(route);
}

function columnName(column: LoadedColumn): string {
  if (column.state === "stored") return column.ipo.companyName;
  if (column.state === "error") return column.message;
  if (column.state === "loading") return "Loading.";
  return "This IPO is not stored.";
}

export function CompareScreen() {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const widths = compareColumnWidth(width);
  const { slugs, toggle, clear } = useCompareSelection();
  const [columns, setColumns] = useState<LoadedColumn[]>([]);
  const comparable = canCompare(slugs);

  useEffect(() => {
    if (!comparable) return;
    const controller = new AbortController();
    const requested = [...slugs];
    void (async () => {
      const target = await readCatalogueTarget();
      if (controller.signal.aborted) return;
      if ("error" in target) {
        setColumns(requested.map((slug) => ({ state: "error", slug, message: target.error })));
        return;
      }
      const loaded = await Promise.all(requested.map(async (slug): Promise<LoadedColumn | null> => {
        try {
          const result = await catalogueClient().loadIssue(slug, {
            origin: target.origin,
            offline: target.offline,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return null;
          if (result.status === "ready") return { state: "stored", ipo: result.ipo };
          if (result.status === "missing") return { state: "missing", slug };
          return { state: "error", slug, message: result.message };
        } catch (error) {
          if (controller.signal.aborted || (error instanceof MobileApiError && error.kind === "cancelled")) return null;
          return { state: "error", slug, message: "This IPO could not be loaded." };
        }
      }));
      if (controller.signal.aborted || loaded.some((column) => column === null)) return;
      setColumns(loaded.filter((column): column is LoadedColumn => column !== null));
    })();
    return () => controller.abort();
  }, [comparable, slugs]);

  const aligned = columns.length === slugs.length && columns.every((column, index) => (column.state === "stored" ? column.ipo.slug : column.slug) === slugs[index]);
  const settled = aligned && columns.every((column) => column.state !== "loading");
  const rows = settled
    ? compareTable(columns.map((column) => (column.state === "stored" ? column : { state: "missing", slug: column.slug }))).map((row) => (
      row.id === "company" ? { ...row, values: columns.map(columnName) } : row
    ))
    : [];

  return (
    <ScreenContainer safeBottom>
      <SectionHeader title="Compare" description="Stored figures for the selected IPOs. Missing figures stay unavailable." />
      {!comparable ? (
        <EmptyState title="Choose 2 to 4 IPOs." description="Add IPOs from search, the calendar, or an IPO page." />
      ) : null}
      {comparable && !settled ? <LoadingSkeleton label="Loading the comparison" /> : null}
      {comparable && settled ? (
        <ScrollView horizontal nestedScrollEnabled accessibilityLabel="IPO comparison" contentContainerStyle={{ paddingBottom: mobileTheme.spacing[2] }}>
          <View>
            <View style={{ flexDirection: "row" }}>
              <View style={{ width: widths.label, minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: palette.border }} />
              {columns.map((column) => (
                <View key={column.state === "stored" ? column.ipo.slug : column.slug} style={{ width: widths.value, gap: mobileTheme.spacing[1], borderBottomWidth: 1, borderBottomColor: palette.border, paddingRight: mobileTheme.spacing[2] }}>
                  {column.state === "stored" ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${column.ipo.companyName}`} onPress={() => openIssue(column.ipo.slug)} style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}>
                      <AppText weight="semibold">{column.ipo.companyName}</AppText>
                    </Pressable>
                  ) : (
                    <AppText weight="semibold">{columnName(column)}</AppText>
                  )}
                  <Pressable accessibilityRole="button" accessibilityLabel="Remove from comparison" onPress={() => toggle(column.state === "stored" ? column.ipo.slug : column.slug)} style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}>
                    <AppText weight="medium" style={{ color: palette.link }}>Remove</AppText>
                  </Pressable>
                </View>
              ))}
            </View>
            {rows.filter((row) => row.id !== "company").map((row) => (
              <View key={row.id} style={{ flexDirection: "row" }}>
                <View style={{ width: widths.label, minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center", paddingVertical: mobileTheme.spacing[2], borderBottomWidth: 1, borderBottomColor: palette.border, paddingRight: mobileTheme.spacing[2] }}>
                  <AppText size="sm" weight="medium">{row.label}</AppText>
                </View>
                {row.values.map((value, index) => (
                  <View key={`${row.id}-${columns[index]?.state === "stored" ? columns[index].ipo.slug : columns[index]?.slug ?? index}`} style={{ width: widths.value, minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center", paddingVertical: mobileTheme.spacing[2], borderBottomWidth: 1, borderBottomColor: palette.border, paddingRight: mobileTheme.spacing[2] }}>
                    <AppText accessibilityLabel={`${row.label}. ${value}`}>{value}</AppText>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
      {comparable ? <AppText size="sm" tone="muted">{compareNote}</AppText> : null}
      {slugs.length > 0 ? <PrimaryButton label="Clear comparison" onPress={clear} /> : null}
    </ScreenContainer>
  );
}
