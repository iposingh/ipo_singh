import { memo } from "react";
import type { IpoSummary } from "@ipo-singh/contracts";
import { breakpoint } from "@ipo-singh/design-tokens";
import {
  actualListingGainPercent,
  formatInr,
  formatInrScale,
  formatIstDate,
  formatPriceBand,
  formatSignedPercent,
  ipoCardStage,
  isPresentNumber,
  istCalendarDate,
} from "@ipo-singh/core";
import { Pressable, View, useWindowDimensions } from "react-native";
import { listingCardLabel } from "../catalogue/facts";
import { boardLabel } from "../design/copy";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";
import { StatusBadge } from "./status-badge";

function dateLine(label: string, value: string | null): string {
  const text = formatIstDate(value);
  return text === "Unavailable" ? `${label} unavailable` : `${label} ${text}`;
}

function Fact({ label, value, wide }: { label: string; value: string; wide: boolean }) {
  return (
    <View style={{ width: wide ? "47%" : "100%", gap: mobileTheme.spacing[1] }}>
      <AppText size="sm" tone="muted">
        {label}
      </AppText>
      <AppText size="sm">{value}</AppText>
    </View>
  );
}

/** Extra card cue beyond StatusBadge. Allotment Awaited/Out live on the badge. */
function lastDayLabel(ipo: IpoSummary, mode: "active" | "listed"): string | null {
  if (mode === "listed") return null;
  const today = istCalendarDate(new Date()) ?? "";
  const stage = ipoCardStage({
    status: ipo.status,
    closeDate: ipo.closeDate,
    today,
    allotmentConfirmed: ipo.allotmentConfirmed,
  });
  return stage === "last-day" ? "Last Day" : null;
}

/**
 * Home / list IPO card. Uses summary catalogue fields only.
 * GMP and subscription stay on the IPO detail screen.
 */
export const IPOCard = memo(function IPOCard({
  ipo,
  mode = "active",
  hideBoard = false,
  onPress,
}: {
  ipo: IpoSummary;
  mode?: "active" | "listed";
  hideBoard?: boolean;
  onPress?: () => void;
}) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= breakpoint.md;
  const lastDay = lastDayLabel(ipo, mode);
  const label = listingCardLabel({
    companyName: ipo.companyName,
    board: ipo.board,
    status: ipo.status,
    openDate: ipo.openDate,
    closeDate: ipo.closeDate,
    facts: null,
    detailState: "hidden",
    allotmentConfirmed: ipo.allotmentConfirmed,
  });
  const style = {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: mobileTheme.radius.lg,
    padding: mobileTheme.spacing[4],
    gap: mobileTheme.spacing[2],
  };

  const body = (
    <View style={{ gap: mobileTheme.spacing[2] }}>
      <AppText weight="semibold" size="lg">
        {ipo.companyName}
      </AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: mobileTheme.spacing[2] }}>
        {hideBoard ? null : (
          <AppText size="sm" tone="muted">
            {boardLabel(ipo.board)}
          </AppText>
        )}
        <StatusBadge status={ipo.status} allotmentConfirmed={ipo.allotmentConfirmed} />
        {lastDay ? (
          <AppText size="sm" weight="medium" style={{ color: palette.warningText }}>
            {lastDay}
          </AppText>
        ) : null}
      </View>
      <AppText size="sm" tone="muted">
        {dateLine("Opens", ipo.openDate)}
      </AppText>
      <AppText size="sm" tone="muted">
        {dateLine("Closes", ipo.closeDate)}
      </AppText>
      {ipo.allotmentDate ? (
        <AppText size="sm" tone="muted">
          {dateLine("Allotment", ipo.allotmentDate)}
        </AppText>
      ) : null}
      {ipo.listingDate || mode === "listed" ? (
        <AppText size="sm" tone="muted">
          {dateLine("Lists", ipo.listingDate ?? null)}
        </AppText>
      ) : null}
      <SummaryFacts ipo={ipo} wide={wide} mode={mode} />
    </View>
  );

  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={{ color: palette.border }}
      style={({ pressed }) => ({ ...style, opacity: pressed ? 0.85 : 1 })}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {body}
      </View>
    </Pressable>
  );
});

function SummaryFacts({ ipo, wide, mode }: { ipo: IpoSummary; wide: boolean; mode: "active" | "listed" }) {
  if (mode === "listed") {
    const issue = isPresentNumber(ipo.listingIssuePriceRupees)
      ? ipo.listingIssuePriceRupees
      : isPresentNumber(ipo.issuePriceRupees)
        ? ipo.issuePriceRupees
        : null;
    const listing = isPresentNumber(ipo.listingPriceRupees) ? ipo.listingPriceRupees : null;
    const percent = actualListingGainPercent({ listingPriceRupees: listing, issuePriceRupees: issue });
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing[3] }}>
        <Fact label="Issue price" value={issue === null ? "Unavailable" : formatInr(issue)} wide={wide} />
        <Fact label="Listing price" value={listing === null ? "Listing price unavailable" : formatInr(listing)} wide={wide} />
        <Fact label="Listing gain/loss" value={percent.status === "value" ? formatSignedPercent(percent.value) : "Unavailable"} wide={wide} />
        <Fact label="Issue size" value={formatInrScale(ipo.issueSizeRupees ?? null)} wide={wide} />
      </View>
    );
  }
  const band = formatPriceBand(ipo.priceBandLowRupees ?? null, ipo.priceBandHighRupees ?? null);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing[3] }}>
      <Fact
        label="Price band"
        value={band === "Unavailable" && isPresentNumber(ipo.issuePriceRupees) ? formatInr(ipo.issuePriceRupees) : band}
        wide={wide}
      />
      <Fact label="Issue size" value={formatInrScale(ipo.issueSizeRupees ?? null)} wide={wide} />
    </View>
  );
}
