import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarEntry } from "@ipo-singh/contracts";
import { formatIstDate, istCalendarDate } from "@ipo-singh/core";
import { router } from "expo-router";
import { Pressable, useWindowDimensions, View } from "react-native";
import { MobileApiError } from "../api/errors";
import { warmCatalogueIssue } from "../catalogue/client";
import { pageFailureMessage, loadCalendarRange } from "../catalogue/load";
import { issueRoute } from "../catalogue/routes";
import { useOnReconnect } from "../network/provider";
import { boardLabel, calendarEventLabel } from "../design/copy";
import { screenContentInset } from "../design/layout";
import {
  calendarBoardParam,
  currentMonth,
  eventCounts,
  eventsOn,
  monthBounds,
  monthWeeks,
  selectedCalendarDay,
  shiftMonth,
  type CalendarBoard,
  type CalendarEventKind,
} from "../discovery/calendar";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "../components/app-text";
import { CompareBar, CompareToggle, FilterChips } from "../components/discovery-controls";
import { WatchSaveButton } from "../components/watch-save-button";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { IPOCard } from "../components/ipo-card";
import { LoadingSkeleton } from "../components/loading-skeleton";
import { PrimaryButton } from "../components/primary-button";
import { ScreenContainer } from "../components/screen-container";
import { SectionHeader } from "../components/section-header";
import { readCatalogueTarget } from "./catalogue-target";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type CalendarState = { phase: "loading" } | { phase: "ready"; items: CalendarEntry[] } | { phase: "error"; message: string };

function openIssue(slug: string) {
  const route = issueRoute(slug);
  if (!route) return;
  warmCatalogueIssue(slug);
  router.push(route);
}

export function CalendarScreen() {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const inset = screenContentInset(width);
  const cellWidth = Math.max(36, Math.floor((Math.min(width, inset.maxWidth) - inset.paddingHorizontal * 2) / 7));
  const today = istCalendarDate(new Date());
  const [month, setMonth] = useState(() => currentMonth(new Date()) ?? "2026-10");
  const [board, setBoard] = useState<CalendarBoard>("mainboard");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CalendarState>({ phase: "loading" });
  const [selected, setSelected] = useState<string | null>(today);
  const softRef = useRef(false);
  const bounds = monthBounds(month);
  const weeks = state.phase === "ready" && bounds ? monthWeeks(month, state.items) : [];
  const selectedDay = selectedCalendarDay({ month, selected, today });
  const selectedEvents = eventsOn(weeks, selectedDay);
  const thisMonth = currentMonth(new Date());
  const todayInView = Boolean(today && bounds && today >= bounds.from && today <= bounds.to);

  function showMonth(next: string | null, day: string | null = null) {
    if (!next) return;
    if (next !== month) {
      setMonth(next);
      setState({ phase: "loading" });
    }
    if (day) setSelected(day);
  }

  function goToday() {
    if (!thisMonth || !today) return;
    showMonth(thisMonth, today);
  }

  function showBoard(next: CalendarBoard) {
    if (next === board) return;
    setBoard(next);
    setState({ phase: "loading" });
  }

  useEffect(() => {
    const current = monthBounds(month);
    if (!current) return;
    const controller = new AbortController();
    const soft = softRef.current;
    softRef.current = false;
    void (async () => {
      const target = await readCatalogueTarget();
      if (controller.signal.aborted) return;
      if ("error" in target) {
        if (soft) return;
        setState({ phase: "error", message: target.error });
        return;
      }
      try {
        const result = await loadCalendarRange({
          origin: target.origin,
          offline: target.offline,
          board: calendarBoardParam(board),
          from: current.from,
          to: current.to,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (result.status === "ready") setState({ phase: "ready", items: result.items });
        else if (!soft) setState({ phase: "error", message: pageFailureMessage(result) });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof MobileApiError && error.kind === "cancelled") return;
        if (!soft) setState({ phase: "error", message: "The calendar could not be loaded." });
      }
    })();
    return () => controller.abort();
  }, [attempt, board, month]);

  const softReload = useCallback(() => {
    softRef.current = true;
    setAttempt((value) => value + 1);
  }, []);

  useOnReconnect(softReload);

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenContainer>
        <SectionHeader
          title="IPO Calendar"
          description="Opening, closing, allotment, and listing dates in India Standard Time. Missing dates stay blank."
        />
        <FilterChips
          label="Board"
          value={board}
          onChange={showBoard}
          options={[
            { value: "mainboard", label: "Mainboard" },
            { value: "sme", label: "SME" },
            { value: "all", label: "All" },
          ]}
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: mobileTheme.spacing[2] }}>
          <MonthStep label="Previous month" text="Previous" onPress={() => showMonth(shiftMonth(month, -1))} />
          <AppText weight="semibold" accessibilityRole="header">
            {bounds?.label ?? "Month unavailable"}
          </AppText>
          <MonthStep label="Next month" text="Next" onPress={() => showMonth(shiftMonth(month, 1))} />
        </View>
        {thisMonth && today && (thisMonth !== month || selectedDay !== today) ? (
          <PrimaryButton label="Today" onPress={goToday} />
        ) : null}
        {state.phase === "loading" ? <LoadingSkeleton label="Loading the calendar" /> : null}
        {state.phase === "error" ? (
          <ErrorState
            title="The calendar could not be loaded"
            message={state.message}
            action={
              <PrimaryButton
                label="Try again"
                onPress={() => {
                  setState({ phase: "loading" });
                  setAttempt((value) => value + 1);
                }}
              />
            }
          />
        ) : null}
        {state.phase === "ready" && state.items.length === 0 ? (
          <EmptyState
            title={`No ${board === "all" ? "" : `${boardLabel(board)} `}dates are stored for ${bounds?.label ?? "this month"}.`}
            description="Empty days are not filled in. Revised dates appear only when the catalogue stores them."
          />
        ) : null}
        {state.phase === "ready" ? (
          <View
            accessibilityLabel={`${bounds?.label ?? "Month"} calendar${todayInView && today ? `, today ${formatIstDate(today)}` : ""}`}
            style={{
              borderWidth: 1,
              borderColor: palette.border,
              borderRadius: mobileTheme.radius.lg,
              overflow: "hidden",
              backgroundColor: palette.surface,
            }}
          >
            <View style={{ flexDirection: "row", backgroundColor: palette.background, borderBottomWidth: 1, borderBottomColor: palette.border }}>
              {weekdays.map((day) => (
                <View
                  key={day}
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={day}
                  style={{ width: cellWidth, minHeight: mobileTheme.sizing.touchTarget, alignItems: "center", justifyContent: "center" }}
                >
                  <AppText size="sm" tone="muted">
                    {day}
                  </AppText>
                </View>
              ))}
            </View>
            {weeks.map((week, weekIndex) => (
              <View key={`${month}-${weekIndex}`} style={{ flexDirection: "row" }}>
                {week.map((day, dayIndex) => {
                  if (!day) {
                    return (
                      <View
                        key={`pad-${weekIndex}-${dayIndex}`}
                        style={{
                          width: cellWidth,
                          minHeight: mobileTheme.sizing.touchTarget + 8,
                          borderBottomWidth: 1,
                          borderRightWidth: dayIndex < 6 ? 1 : 0,
                          borderColor: palette.border,
                          backgroundColor: palette.background,
                        }}
                      />
                    );
                  }
                  return (
                    <DayCell
                      key={day.date}
                      date={day.date}
                      events={day.events}
                      width={cellWidth}
                      selected={day.date === selectedDay}
                      isToday={day.date === today}
                      onPress={() => setSelected(day.date)}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}
        {state.phase === "ready" ? (
          <View style={{ gap: mobileTheme.spacing[3] }} accessibilityLabel={`Events on ${formatIstDate(selectedDay)}`}>
            <AppText weight="semibold">{formatIstDate(selectedDay)}</AppText>
            {selectedEvents.length === 0 ? (
              <EmptyState
                title="No dates are stored for this day."
                description="Opening, closing, allotment, and listing dates appear here when the catalogue has them."
              />
            ) : (
              selectedEvents.map((item) => (
                <View key={`${item.date}-${item.event}-${item.ipo.id}`} style={{ gap: mobileTheme.spacing[2] }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: mobileTheme.spacing[2] }}>
                    <EventChip event={item.event} />
                    <BoardChip board={item.ipo.board} />
                  </View>
                  <IPOCard ipo={item.ipo} onPress={() => openIssue(item.ipo.slug)} />
                  <WatchSaveButton ipo={item.ipo} />
                  <CompareToggle slug={item.ipo.slug} />
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScreenContainer>
      <CompareBar />
    </View>
  );
}

function DayCell({
  date,
  events,
  width,
  selected,
  isToday,
  onPress,
}: {
  date: string;
  events: readonly CalendarEntry[];
  width: number;
  selected: boolean;
  isToday: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const counts = eventCounts(events);
  const kinds = (Object.keys(counts) as CalendarEventKind[]).filter((kind) => counts[kind] > 0);
  const names = events.map((item) => `${calendarEventLabel(item.event)} ${boardLabel(item.ipo.board)} ${item.ipo.companyName}`).join(", ");
  const summary = kinds.map((kind) => `${counts[kind]} ${calendarEventLabel(kind)}`).join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        names
          ? `${formatIstDate(date)}${isToday ? ", today" : ""}. ${summary}. ${names}`
          : `${formatIstDate(date)}${isToday ? ", today" : ""}. No stored events.`
      }
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        width,
        minHeight: mobileTheme.sizing.touchTarget + 8,
        paddingVertical: mobileTheme.spacing[1],
        paddingHorizontal: 2,
        justifyContent: "flex-start",
        alignItems: "center",
        gap: 2,
        borderBottomWidth: 1,
        borderRightWidth: 1,
        borderColor: palette.border,
        backgroundColor: selected ? palette.primary : isToday ? palette.background : palette.surface,
      }}
    >
      <AppText
        size="sm"
        weight={selected || isToday ? "semibold" : "regular"}
        style={selected ? undefined : isToday ? { color: palette.primarySolid } : undefined}
      >
        {Number(date.slice(8, 10))}
      </AppText>
      {kinds.length > 0 ? (
        <View accessible={false} style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 2 }}>
          {kinds.map((kind) => (
            <View
              key={kind}
              style={{
                width: 6,
                height: 6,
                borderRadius: mobileTheme.radius.full,
                backgroundColor: eventDotColor(kind, palette.primarySolid, palette.negative, palette.deep, palette.warning),
              }}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function eventDotColor(
  event: CalendarEventKind,
  open: string,
  close: string,
  allotment: string,
  listing: string,
): string {
  if (event === "open") return open;
  if (event === "close") return close;
  if (event === "allotment") return allotment;
  return listing;
}

function EventChip({ event }: { event: CalendarEventKind }) {
  const { palette } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={calendarEventLabel(event)}
      style={{
        alignSelf: "flex-start",
        borderRadius: mobileTheme.radius.full,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.surface,
        paddingHorizontal: mobileTheme.spacing[2],
        paddingVertical: mobileTheme.spacing[1],
      }}
    >
      <AppText size="xs" weight="semibold">
        {calendarEventLabel(event)}
      </AppText>
    </View>
  );
}

function BoardChip({ board }: { board: CalendarEntry["ipo"]["board"] }) {
  const { palette } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={boardLabel(board)}
      style={{
        alignSelf: "flex-start",
        borderRadius: mobileTheme.radius.full,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: board === "mainboard" ? palette.background : palette.surface,
        paddingHorizontal: mobileTheme.spacing[2],
        paddingVertical: mobileTheme.spacing[1],
      }}
    >
      <AppText size="xs" weight="semibold" style={board === "sme" ? { color: palette.deep } : undefined}>
        {boardLabel(board)}
      </AppText>
    </View>
  );
}

function MonthStep({ label, text, onPress }: { label: string; text: string; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center", paddingHorizontal: mobileTheme.spacing[1] }}
    >
      <AppText weight="medium" style={{ color: palette.link }}>
        {text}
      </AppText>
    </Pressable>
  );
}
