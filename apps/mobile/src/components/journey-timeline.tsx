import type { Ipo } from "@ipo-singh/contracts";
import { formatIstDate, ipoJourney, type JourneyState } from "@ipo-singh/core";
import { ScrollView, View } from "react-native";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";

export function JourneyTimeline({ ipo }: { ipo: Ipo }) {
  const { palette } = useTheme();
  const milestones = ipoJourney({
    status: ipo.status,
    openDate: ipo.dates.openDate,
    closeDate: ipo.dates.closeDate,
    allotmentDate: ipo.dates.allotmentDate,
    listingDate: ipo.dates.listingDate,
    allotmentConfirmed: ipo.allotmentConfirmed === true,
  });
  return (
    <View accessibilityLabel="IPO journey" style={{ gap: mobileTheme.spacing[2] }}>
      <AppText weight="semibold">IPO journey</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: mobileTheme.spacing[2] }}>
        {milestones.map((milestone, index) => {
          const complete = milestone.state === "complete";
          const current = milestone.state === "current";
          const date = milestone.date ? formatIstDate(milestone.date) : "Date unavailable";
          return (
            <View
              key={milestone.id}
              accessibilityState={{ selected: current }}
              style={{
                width: 148,
                gap: mobileTheme.spacing[1],
                borderWidth: 1,
                borderColor: complete || current ? palette.primarySolid : palette.border,
                backgroundColor: complete ? `${palette.primarySolid}18` : palette.surface,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing[3],
              }}
            >
              <AppText size="sm" tone="muted">
                {index + 1}. {stateLabel(milestone.state)}
              </AppText>
              <AppText weight="semibold">{milestone.label}</AppText>
              <AppText size="sm">{date === "Unavailable" ? "Date unavailable" : date}</AppText>
              {milestone.note ? (
                <AppText size="sm" tone="warning">
                  {milestone.note}
                </AppText>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function stateLabel(state: JourneyState): string {
  if (state === "complete") return "Completed";
  if (state === "current") return "Current";
  if (state === "upcoming") return "Upcoming";
  return "Unavailable";
}
