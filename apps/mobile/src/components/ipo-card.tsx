import { memo, useRef } from "react";
import type { IpoSummary } from "@ipo-singh/contracts";
import {
  actualListingGainPercent,
  formatInr,
  formatIstDate,
  formatPriceBand,
  formatSignedPercent,
  formatSubscriptionMultiple,
  ipoCardStage,
  isPresentNumber,
  istCalendarDate,
} from "@ipo-singh/core";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Share, View } from "react-native";
import { listingCardLabel } from "../catalogue/facts";
import { publicIpoPage } from "../detail/links";
import { readAppEnvironment } from "../api/origin";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { cardSurfaceStyle } from "../theme/surfaces";
import { AppText } from "./app-text";
import { StatusBadge } from "./status-badge";

function dash(value: string | null | undefined): string {
  if (!value || value === "Unavailable") return "—";
  return value;
}

function dateRange(open: string | null, close: string | null): string {
  const openText = formatIstDate(open);
  const closeText = formatIstDate(close);
  if (openText === "Unavailable" && closeText === "Unavailable") return "Dates —";
  if (openText === "Unavailable") return `Closes ${closeText}`;
  if (closeText === "Unavailable") return `Opens ${openText}`;
  return `${openText} – ${closeText}`;
}

function closingToday(ipo: IpoSummary, mode: "active" | "listed"): boolean {
  if (mode === "listed") return false;
  const today = istCalendarDate(new Date()) ?? "";
  return (
    ipoCardStage({
      status: ipo.status,
      closeDate: ipo.closeDate,
      today,
      allotmentConfirmed: ipo.allotmentConfirmed,
    }) === "last-day"
  );
}

function offerPrice(ipo: IpoSummary): string {
  const band = formatPriceBand(ipo.priceBandLowRupees ?? null, ipo.priceBandHighRupees ?? null);
  if (band !== "Unavailable") return band;
  return isPresentNumber(ipo.issuePriceRupees) ? formatInr(ipo.issuePriceRupees) : "—";
}

function lotSize(ipo: IpoSummary): string {
  return isPresentNumber(ipo.lotSizeShares) ? `${new Intl.NumberFormat("en-IN").format(ipo.lotSizeShares)} shares` : "—";
}

function subscription(ipo: IpoSummary): string {
  return isPresentNumber(ipo.subscriptionTotalTimes) ? formatSubscriptionMultiple(ipo.subscriptionTotalTimes) : "—";
}

function listedFacts(ipo: IpoSummary): { price: string; gain: string; issue: string } {
  const issue = isPresentNumber(ipo.listingIssuePriceRupees)
    ? ipo.listingIssuePriceRupees
    : isPresentNumber(ipo.issuePriceRupees)
      ? ipo.issuePriceRupees
      : null;
  const listing = isPresentNumber(ipo.listingPriceRupees) ? ipo.listingPriceRupees : null;
  const percent = actualListingGainPercent({ listingPriceRupees: listing, issuePriceRupees: issue });
  const storedGain = isPresentNumber(ipo.listingGainPercent) ? formatSignedPercent(ipo.listingGainPercent) : null;
  return {
    price: listing === null ? "—" : formatInr(listing),
    gain: percent.status === "value" ? formatSignedPercent(percent.value) : (storedGain ?? "—"),
    issue: issue === null ? "—" : formatInr(issue),
  };
}

/**
 * Compact IPO list card: identity + dates/status/share on top, offer or listing facts below.
 * GMP stays on the IPO detail screen.
 */
export const IPOCard = memo(function IPOCard({
  ipo,
  mode = "active",
  onPress,
}: {
  ipo: IpoSummary;
  mode?: "active" | "listed";
  onPress?: () => void;
}) {
  const { palette, colorScheme } = useTheme();
  const navigating = useRef(false);
  const lastDay = closingToday(ipo, mode);
  const listed = mode === "listed" ? listedFacts(ipo) : null;
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

  async function share() {
    const page = publicIpoPage(
      process.env.EXPO_PUBLIC_IPO_SINGH_SITE_URL,
      ipo.slug,
      readAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV, __DEV__),
    );
    const url = page.url ?? `https://iposingh.com/ipos/${ipo.slug}`;
    try {
      await Share.share({ message: `${ipo.companyName} IPO on IPO Singh\n${url}`, url });
    } catch {
      // User cancellation is not an error.
    }
  }

  function open() {
    if (!onPress || navigating.current) return;
    navigating.current = true;
    onPress();
    setTimeout(() => {
      navigating.current = false;
    }, 900);
  }

  const cardStyle = {
    ...cardSurfaceStyle(palette, colorScheme),
    borderRadius: mobileTheme.radius.lg,
    overflow: "hidden" as const,
  };

  const statusNode = lastDay ? (
    <View
      accessible
      accessibilityLabel="Closing Today"
      style={{
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        borderRadius: mobileTheme.radius.full,
        paddingHorizontal: mobileTheme.spacing[2],
        paddingVertical: mobileTheme.spacing[1],
      }}
    >
      <AppText size="xs" weight="medium" style={{ color: palette.warningText }}>
        Closing Today
      </AppText>
    </View>
  ) : (
    <StatusBadge status={ipo.status} allotmentConfirmed={ipo.allotmentConfirmed} />
  );

  const facts = listed ? (
    <>
      <Fact label="Listing price" value={listed.price} />
      <Fact label="Listing gain" value={listed.gain} />
      <Fact label="Issue price" value={listed.issue} />
    </>
  ) : (
    <>
      <Fact label="Offer price" value={dash(offerPrice(ipo))} />
      <Fact label="Lot size" value={lotSize(ipo)} />
      <Fact label="Subscription" value={subscription(ipo)} />
    </>
  );

  const shareButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Share ${ipo.companyName}`}
      hitSlop={8}
      onPress={() => {
        void share();
      }}
      android_ripple={{ color: palette.border, borderless: true }}
      style={{
        minWidth: mobileTheme.sizing.touchTarget,
        minHeight: mobileTheme.sizing.touchTarget,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="share-outline" size={20} color={palette.foreground} />
    </Pressable>
  );

  const main = (
    <View>
      <View
        style={{
          gap: mobileTheme.spacing[2],
          padding: mobileTheme.spacing[4],
          paddingRight: mobileTheme.spacing[2],
          borderBottomWidth: 1,
          borderBottomColor: palette.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: mobileTheme.spacing[2] }}>
          <View style={{ flex: 1, gap: mobileTheme.spacing[1], minWidth: 0 }}>
            <AppText weight="semibold" size="lg" numberOfLines={2}>
              {ipo.companyName}
            </AppText>
            <AppText size="sm" tone="muted" numberOfLines={1}>
              {dateRange(ipo.openDate, ipo.closeDate)}
            </AppText>
          </View>
          <View style={{ alignItems: "flex-end", gap: mobileTheme.spacing[2] }}>
            {statusNode}
            {shareButton}
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: mobileTheme.spacing[3],
          paddingHorizontal: mobileTheme.spacing[4],
          paddingVertical: mobileTheme.spacing[3],
        }}
      >
        {facts}
      </View>
    </View>
  );

  if (!onPress) return <View style={cardStyle}>{main}</View>;

  // Share sits outside the card Pressable so it never triggers navigation.
  return (
    <View style={cardStyle}>
      <View
        style={{
          gap: mobileTheme.spacing[2],
          padding: mobileTheme.spacing[4],
          paddingRight: mobileTheme.spacing[2],
          borderBottomWidth: 1,
          borderBottomColor: palette.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: mobileTheme.spacing[2] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={open}
            android_ripple={{ color: palette.border }}
            style={({ pressed }) => ({ flex: 1, gap: mobileTheme.spacing[1], minWidth: 0, opacity: pressed ? 0.9 : 1 })}
          >
            <AppText weight="semibold" size="lg" numberOfLines={2}>
              {ipo.companyName}
            </AppText>
            <AppText size="sm" tone="muted" numberOfLines={1}>
              {dateRange(ipo.openDate, ipo.closeDate)}
            </AppText>
          </Pressable>
          <View style={{ alignItems: "flex-end", gap: mobileTheme.spacing[2] }}>
            {statusNode}
            {shareButton}
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={open}
        android_ripple={{ color: palette.border }}
        style={({ pressed }) => ({
          flexDirection: "row",
          flexWrap: "wrap",
          gap: mobileTheme.spacing[3],
          paddingHorizontal: mobileTheme.spacing[4],
          paddingVertical: mobileTheme.spacing[3],
          opacity: pressed ? 0.9 : 1,
        })}
      >
        {facts}
      </Pressable>
    </View>
  );
});

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: "28%", flexGrow: 1, gap: 2 }}>
      <AppText size="sm" tone="muted">
        {label}
      </AppText>
      <AppText size="sm" weight="medium" numberOfLines={2}>
        {value}
      </AppText>
    </View>
  );
}
