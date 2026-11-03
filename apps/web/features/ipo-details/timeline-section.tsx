import type { Ipo } from "@ipo-singh/contracts";
import { formatIstDate, ipoJourney, type JourneyMilestone, type JourneyState } from "@ipo-singh/core";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { IndiaDate } from "@/features/ipos/ipo-facts";

export function TimelineSection({ ipo }: { ipo: Ipo | null }) {
  const milestones = ipo
    ? ipoJourney({
        status: ipo.status,
        openDate: ipo.dates.openDate,
        closeDate: ipo.dates.closeDate,
        allotmentDate: ipo.dates.allotmentDate,
        listingDate: ipo.dates.listingDate,
        allotmentConfirmed: ipo.allotmentConfirmed === true,
      })
    : [];
  const profile = ipo?.profile ?? null;
  return (
    <section className="grid gap-4" aria-labelledby="ipo-timeline">
      <SectionHeader id="ipo-timeline" title="IPO journey" />
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {milestones.map((milestone, index) => (
          <li key={milestone.id} className="min-w-0">
            <MilestoneCard milestone={milestone} index={index} />
          </li>
        ))}
      </ol>
      {profile?.refundDate || profile?.dematCreditDate ? (
        <Card className="grid gap-2 p-4 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted">Refund </span>
            <IndiaDate value={profile.refundDate} />
          </p>
          <p>
            <span className="text-muted">Demat credit </span>
            <IndiaDate value={profile.dematCreditDate} />
          </p>
        </Card>
      ) : null}
    </section>
  );
}

function MilestoneCard({ milestone, index }: { milestone: JourneyMilestone; index: number }) {
  const date = milestone.date ? formatIstDate(milestone.date) : "Date unavailable";
  const status = stateLabel(milestone.state);
  return (
    <article
      className={`relative grid h-full gap-1 rounded-panel border p-3 ${toneClass(milestone.state)}`}
      aria-current={milestone.state === "current" ? "step" : undefined}
    >
      <p className="text-xs font-medium text-muted">
        {index + 1}. {status}
      </p>
      <h3 className="text-sm font-semibold text-foreground">{milestone.label}</h3>
      <p className="text-sm text-foreground">
        {milestone.date ? <time dateTime={milestone.date}>{date}</time> : date}
      </p>
      {milestone.note ? <p className="text-xs text-warning-text">{milestone.note}</p> : null}
    </article>
  );
}

function stateLabel(state: JourneyState): string {
  if (state === "complete") return "Completed";
  if (state === "current") return "Current";
  if (state === "upcoming") return "Upcoming";
  return "Unavailable";
}

function toneClass(state: JourneyState): string {
  if (state === "complete") return "border-primary bg-primary/10";
  if (state === "current") return "border-primary bg-surface ring-1 ring-primary/40";
  return "border-border bg-surface";
}
