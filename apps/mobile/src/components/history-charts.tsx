import { memo, useMemo, useState } from "react";
import type { SubscriptionSnapshot } from "@ipo-singh/contracts";
import { formatSubscriptionMultiple } from "@ipo-singh/core";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { BarChart, LineChart } from "react-native-gifted-charts";
import {
  availableHistoryRanges,
  canDrawLineChart,
  categoryComparisonSummary,
  chartFrameWidth,
  chartTicks,
  clipGmpObservations,
  clipSubscriptionObservations,
  dailyGmpPoints,
  dailyMaxGapMs,
  gmpHistorySummary,
  gmpPercentPlot,
  gmpRupeePlot,
  gmpTableRows,
  historyProvenanceText,
  historyRangeChoices,
  intradayGmpPoints,
  intradayMaxGapMs,
  lineChartDataPoints,
  plotBands,
  safeChartFrameWidth,
  sanitizeCategoryBarsForNative,
  safeChartSpacing,
  sanitizePlotPointsForNative,
  subscriptionCategoryBars,
  subscriptionHistorySummary,
  subscriptionPlot,
  subscriptionSeriesChoices,
  subscriptionTable,
  type HistoryRangeKey,
  type PlotPoint,
} from "../charts/series";
import type { ChartPhase, GmpHistoryDocument, SubscriptionHistoryDocument } from "../catalogue/history";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";
import { ChartSafeBoundary } from "./chart-safe-boundary";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { LoadingSkeleton } from "./loading-skeleton";

const pointLimit = 80;

function ChoiceRow({ choices, selected, onSelect }: { choices: readonly { key: string; label: string }[]; selected: string; onSelect: (key: string) => void }) {
  const { palette } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      contentContainerStyle={{ gap: mobileTheme.spacing[2], alignItems: "center" }}
    >
      {choices.map((choice) => {
        const active = selected === choice.key;
        return (
          <Pressable
            key={choice.key}
            accessibilityRole="tab"
            accessibilityLabel={choice.label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(choice.key)}
            style={{
              minHeight: mobileTheme.sizing.touchTarget,
              justifyContent: "center",
              paddingHorizontal: mobileTheme.spacing[3],
              borderRadius: mobileTheme.radius.full,
              backgroundColor: active ? palette.primarySolid : palette.surface,
              borderWidth: 1,
              borderColor: active ? palette.primarySolid : palette.border,
            }}
          >
            <AppText size="sm" weight="medium" style={{ color: active ? palette.primaryForeground : palette.foreground }}>
              {choice.label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const ObservationChart = memo(function ObservationChart({
  points,
  width,
  summary,
  pressHint,
}: {
  points: readonly PlotPoint[];
  width: number;
  summary: string;
  pressHint: string;
}) {
  const { palette } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const safePoints = useMemo(() => sanitizePlotPointsForNative(points), [points]);
  const ticks = useMemo(() => new Set(chartTicks(safePoints)), [safePoints]);
  const bands = useMemo(() => plotBands(safePoints), [safePoints]);
  /**
   * Index-spaced points only. Never pass Unix timestamps as `x` — gifted-charts treats
   * custom x as layout coordinates; millisecond epochs create huge native SVG paths and
   * have crashed Android release builds when opening IPO detail with GMP history.
   */
  const chartWidth = safeChartFrameWidth(width);
  const spacing = safeChartSpacing(chartWidth, safePoints.length);
  const hidePoints = safePoints.length > pointLimit;
  const finiteBands = bands
    .map((band) => band.filter((point) => Number.isFinite(point.value) && Number.isFinite(point.at)))
    .filter((band) => band.length > 0);
  const dataSet = finiteBands.map((band) => ({
    data: lineChartDataPoints(band, ticks).map((point, index) => {
      const source = band.filter((row) => Number.isFinite(row.value))[index];
      return {
        value: point.value,
        label: point.label,
        dataPointColor:
          source?.high && source.low
            ? palette.warning
            : source?.high
              ? palette.positive
              : source?.low
                ? palette.negative
                : palette.primarySolid,
        onPress: () => {
          if (source) setSelected(source.tooltip);
        },
      };
    }),
    color: palette.primarySolid,
    thickness: 2,
    curved: false,
    hideDataPoints: hidePoints,
    dataPointsRadius: 4,
  }));

  if (dataSet.length === 0 || dataSet.every((band) => band.data.length === 0)) {
    return <EmptyState title="Chart unavailable" description="Stored readings could not be plotted safely on this device." />;
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      style={{ gap: mobileTheme.spacing[2] }}
    >
      <AppText size="sm">{summary}</AppText>
      <ChartSafeBoundary>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <LineChart
            data={dataSet.length === 1 ? dataSet[0]!.data : []}
            dataSet={dataSet.length > 1 ? dataSet : undefined}
            width={chartWidth}
            height={168}
            spacing={spacing}
            initialSpacing={8}
            endSpacing={8}
            curved={false}
            isAnimated={false}
            animateOnDataChange={false}
            thickness={2}
            color={palette.primarySolid}
            yAxisColor={palette.border}
            xAxisColor={palette.border}
            rulesColor={palette.border}
            yAxisTextStyle={{ color: palette.muted, fontSize: 11 }}
            xAxisLabelTextStyle={{ color: palette.muted, fontSize: 11 }}
            yAxisLabelWidth={52}
            rotateLabel={chartWidth < 360}
            noOfSections={4}
            showFractionalValues
            roundToDigits={2}
            focusEnabled={false}
            backgroundColor={palette.surface}
          />
        </View>
      </ChartSafeBoundary>
      <AppText size="sm" tone="muted">
        {pressHint}
      </AppText>
      {selected ? (
        <AppText size="sm" accessibilityLiveRegion="polite">
          {selected}
        </AppText>
      ) : null}
    </View>
  );
});

function ReadingList({ title, rows }: { title: string; rows: readonly { key: string; lines: { label: string; value: string }[] }[] }) {
  // Plain views — FlatList nested in the detail ScrollView has crashed Android release builds.
  return (
    <View accessibilityLabel={title} style={{ gap: mobileTheme.spacing[1] }}>
      <AppText weight="semibold" style={{ paddingBottom: mobileTheme.spacing[2] }}>
        {title}
      </AppText>
      {rows.map((item) => (
        <View
          key={item.key}
          accessible
          accessibilityLabel={item.lines.map((line) => `${line.label} ${line.value}`).join(". ")}
          style={{ gap: mobileTheme.spacing[1], paddingVertical: mobileTheme.spacing[2] }}
        >
          {item.lines.map((line) => (
            <AppText key={`${item.key}-${line.label}`} size="sm">
              {line.label}: {line.value}
            </AppText>
          ))}
        </View>
      ))}
    </View>
  );
}

function RangeChoices({
  timestamps,
  selected,
  onSelect,
}: {
  timestamps: readonly number[];
  selected: HistoryRangeKey;
  onSelect: (key: HistoryRangeKey) => void;
}) {
  const available = availableHistoryRanges(timestamps);
  if (available.length <= 1) return null;
  const choices = historyRangeChoices.filter((choice) => available.includes(choice.key));
  const active = choices.some((choice) => choice.key === selected) ? selected : "all";
  return (
    <ChoiceRow
      choices={choices}
      selected={active}
      onSelect={(key) => onSelect(key === "7d" || key === "30d" ? key : "all")}
    />
  );
}

export function GmpHistoryPanels({ history }: { history: ChartPhase<GmpHistoryDocument> }) {
  const { width } = useWindowDimensions();
  const frame = safeChartFrameWidth(chartFrameWidth(width));
  const [range, setRange] = useState<HistoryRangeKey>("all");
  if (history.phase === "loading") return <LoadingSkeleton label="Loading GMP history" />;
  if (history.phase === "unavailable") {
    return <ErrorState title="GMP history could not be loaded" message={history.message} />;
  }
  const clipped = clipGmpObservations(history.value.observations, range);
  const daily = dailyGmpPoints(clipped, history.value.window ?? null);
  const intraday = intradayGmpPoints(clipped, history.value.window ?? null);
  const dailyPlot = gmpRupeePlot(daily, dailyMaxGapMs);
  const intradayPlot = gmpRupeePlot(intraday, intradayMaxGapMs);
  const rangeTimes = history.value.observations.map((row) => Date.parse(row.observedAt)).filter((at) => !Number.isNaN(at));
  return (
    <View style={{ gap: mobileTheme.spacing[4] }}>
      {history.notice ? (
        <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">
          {history.notice}
        </AppText>
      ) : null}
      <AppText size="sm" tone="muted">
        {historyProvenanceText(history.value.provenance)}
      </AppText>
      {history.value.window?.truncated ? <AppText size="sm" tone="muted">This history is partial. Older days were not included.</AppText> : null}
      <RangeChoices timestamps={rangeTimes} selected={range} onSelect={setRange} />
      <GmpModeChart title="Daily GMP" points={daily} rupeePlot={dailyPlot} maxGapMs={dailyMaxGapMs} width={frame} historyWindow={history.value.window ?? null} emptyDescription="No daily GMP history is loaded for this range. Missing days are left blank and are not plotted as zero." />
      <GmpModeChart
        title="Intraday GMP"
        points={intraday}
        rupeePlot={intradayPlot}
        maxGapMs={intradayMaxGapMs}
        width={frame}
        historyWindow={history.value.window ?? null}
        emptyDescription={
          history.value.window?.timelineLocked
            ? "Intraday GMP is not included for this source plan. No sample points were added."
            : "No intraday GMP history is loaded for this range. Missing slots are not filled in."
        }
      />
    </View>
  );
}

function GmpModeChart({
  title,
  points,
  rupeePlot,
  maxGapMs,
  width,
  historyWindow,
  emptyDescription,
}: {
  title: string;
  points: ReturnType<typeof dailyGmpPoints>;
  rupeePlot: PlotPoint[];
  maxGapMs: number;
  width: number;
  historyWindow: GmpHistoryDocument["window"] | null;
  emptyDescription: string;
}) {
  const [mode, setMode] = useState<"rupees" | "percent">("rupees");
  const percentPlot = useMemo(() => gmpPercentPlot(points, maxGapMs), [points, maxGapMs]);
  const plot = mode === "rupees" ? rupeePlot : percentPlot;
  const rows = gmpTableRows(points);
  const drawLine = canDrawLineChart(plot.length);
  return (
    <View style={{ gap: mobileTheme.spacing[3] }}>
      <AppText weight="semibold">{title}</AppText>
      <ChoiceRow
        choices={[
          { key: "rupees", label: "Rupees (₹)" },
          { key: "percent", label: "Percent (%)" },
        ]}
        selected={mode}
        onSelect={(key) => setMode(key === "percent" ? "percent" : "rupees")}
      />
      {plot.length === 0 ? (
        <EmptyState title={`${title} has no stored readings`} description={emptyDescription} />
      ) : drawLine ? (
        <ObservationChart
          points={plot}
          width={width}
          summary={gmpHistorySummary(title, plot.length, historyWindow ?? null)}
          pressHint={plot.length > pointLimit ? "The table lists every stored reading in IST." : "Press a point for its rupee amount, percentage, and IST time. The table lists the same readings."}
        />
      ) : (
        <EmptyState
          title={`${title} needs more readings for a line`}
          description="One stored reading is listed below. A line chart needs at least two observations. No values were invented."
        />
      )}
      {rows.length > 0 ? (
        <ReadingList
          title={`${title} readings`}
          rows={rows.map((row) => ({
            key: row.key,
            lines: [
              { label: "Observed (IST)", value: row.when },
              { label: "GMP (₹)", value: row.amount },
              { label: "GMP %", value: row.percent },
              { label: "Mark", value: row.mark },
            ],
          }))}
        />
      ) : null}
    </View>
  );
}

export function SubscriptionHistoryPanels({
  history,
  snapshot,
}: {
  history: ChartPhase<SubscriptionHistoryDocument>;
  snapshot: SubscriptionSnapshot | null;
}) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const frame = safeChartFrameWidth(chartFrameWidth(width));
  const latest = history.phase === "ready"
    ? [...history.value.observations].reverse().find((row) => subscriptionCategoryBars(row).length > 0) ?? null
    : null;
  const rawBars = subscriptionCategoryBars(snapshot ?? latest);
  const { bars, maxValue } = sanitizeCategoryBarsForNative(rawBars);
  const [selectedBar, setSelectedBar] = useState<string | null>(null);
  return (
    <View style={{ gap: mobileTheme.spacing[4] }}>
      {history.phase === "ready" ? (
        <AppText size="sm" tone="muted">
          {historyProvenanceText(history.value.provenance)}
        </AppText>
      ) : null}
      <View style={{ gap: mobileTheme.spacing[2] }}>
        <AppText weight="semibold">Category comparison</AppText>
        <AppText size="sm">{categoryComparisonSummary(bars)}</AppText>
        {bars.length === 0 ? (
          <EmptyState title="No category comparison is stored" description="A missing category stays blank. A published zero stays 0x." />
        ) : (
          <View accessible accessibilityRole="image" accessibilityLabel={categoryComparisonSummary(bars)} style={{ gap: mobileTheme.spacing[2] }}>
            <ChartSafeBoundary title="Category chart unavailable">
              <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <BarChart
                  data={bars.map((bar) => ({
                    value: bar.times,
                    label: bar.label,
                    frontColor: palette.primarySolid,
                    onPress: () => setSelectedBar(`${bar.label}: ${formatSubscriptionMultiple(bar.times)}`),
                  }))}
                  width={frame}
                  height={168}
                  barWidth={frame < 360 ? 18 : 28}
                  spacing={frame < 360 ? 10 : 16}
                  labelsExtraHeight={frame < 360 ? 36 : 16}
                  rotateLabel={frame < 360}
                  isAnimated={false}
                  maxValue={maxValue}
                  noOfSections={4}
                  showFractionalValues
                  roundToDigits={2}
                  yAxisColor={palette.border}
                  xAxisColor={palette.border}
                  rulesColor={palette.border}
                  yAxisTextStyle={{ color: palette.muted, fontSize: 11 }}
                  xAxisLabelTextStyle={{ color: palette.muted, fontSize: 11 }}
                  yAxisLabelWidth={40}
                  backgroundColor={palette.surface}
                />
              </View>
            </ChartSafeBoundary>
            {selectedBar ? (
              <AppText size="sm" accessibilityLiveRegion="polite">
                {selectedBar}
              </AppText>
            ) : (
              <AppText size="sm" tone="muted">
                Press a bar for its subscription multiple. QIB, NII / HNI, Retail and other stored categories appear when the catalogue has them.
              </AppText>
            )}
          </View>
        )}
      </View>
      <SubscriptionTrend history={history} snapshot={snapshot} width={frame} />
    </View>
  );
}

function SubscriptionTrend({ history, snapshot, width }: { history: ChartPhase<SubscriptionHistoryDocument>; snapshot: SubscriptionSnapshot | null; width: number }) {
  const [range, setRange] = useState<HistoryRangeKey>("all");
  const observations = useMemo(() => {
    if (history.phase !== "ready") return [];
    return clipSubscriptionObservations(history.value.observations, range);
  }, [history, range]);
  const allTimes = useMemo(() => {
    if (history.phase !== "ready") return [];
    return history.value.observations.flatMap((row) => {
      if (row.observedAt) {
        const at = Date.parse(row.observedAt);
        return Number.isNaN(at) ? [] : [at];
      }
      return [];
    });
  }, [history]);
  const choices = subscriptionSeriesChoices(observations, snapshot);
  const [selected, setSelected] = useState("TOTAL");
  const active = choices.some((choice) => choice.key === selected) ? selected : "TOTAL";
  const plot = useMemo(() => (history.phase === "ready" ? subscriptionPlot(observations, active) : []), [history.phase, observations, active]);
  const table = useMemo(() => (history.phase === "ready" ? subscriptionTable(observations) : null), [history.phase, observations]);
  const label = choices.find((choice) => choice.key === active)?.label ?? "Total";
  if (history.phase === "loading") return <LoadingSkeleton label="Loading subscription history" />;
  if (history.phase === "unavailable") return <ErrorState title="Subscription history could not be loaded" message={history.message} />;
  return (
    <View style={{ gap: mobileTheme.spacing[3] }}>
      {history.notice ? (
        <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">
          {history.notice}
        </AppText>
      ) : null}
      <AppText weight="semibold">Day-wise subscription</AppText>
      <RangeChoices timestamps={allTimes} selected={range} onSelect={setRange} />
      <ChoiceRow choices={choices} selected={active} onSelect={setSelected} />
      {plot.length === 0 ? (
        <EmptyState title={`No ${label} readings are stored`} description="Missing days are left blank and are not plotted as zero. A published zero stays 0x." />
      ) : canDrawLineChart(plot.length) ? (
        <ObservationChart
          points={plot}
          width={width}
          summary={subscriptionHistorySummary(label, plot.length)}
          pressHint={plot.length > pointLimit ? "The table lists every stored day in IST." : "Press a point for its multiple and IST time. The table lists the same days."}
        />
      ) : (
        <EmptyState
          title={`No ${label} line yet`}
          description="One stored reading is listed below. A line chart needs at least two observations. No values were invented."
        />
      )}
      {table && table.rows.length > 0 ? (
        <ReadingList
          title="Day-wise subscription history"
          rows={table.rows.map((row) => ({
            key: row.key,
            lines: table.columns.map((column, index) => ({ label: column.label, value: row.cells[index] ?? "Unavailable" })),
          }))}
        />
      ) : null}
    </View>
  );
}
