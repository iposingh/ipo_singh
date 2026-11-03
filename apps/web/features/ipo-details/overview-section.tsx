import type { Ipo } from "@ipo-singh/contracts";
import { formatInrScale, isPresentNumber } from "@ipo-singh/core";
import { MissingValue } from "@/components/financial/missing-value";
import { PriceBand } from "@/components/financial/price-band";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Fact, FactList } from "@/features/ipo-details/fact-list";
import { LotSize, MinimumInvestment } from "@/features/ipos/ipo-facts";
import { boardLabel, listingLifecycleLabel } from "@/features/ipos/labels";

export function OverviewSection({ ipo }: { ipo: Ipo | null }) {
  const profile = ipo?.profile ?? null;
  return (
    <section className="grid gap-4" aria-labelledby="ipo-overview">
      <SectionHeader id="ipo-overview" title="Overview" description="Company information, issue size, price band, lot size, minimum investment, and the dates published for this issue." />
      <Card className="p-0 px-5">
        <FactList>
          <Fact label="Company">{ipo ? ipo.companyName : <MissingValue label="Not loaded" />}</Fact>
          <Fact label="Board">{ipo ? boardLabel(ipo.board) : <MissingValue />}</Fact>
          <Fact label="Status">
            {ipo
              ? listingLifecycleLabel({ status: ipo.status, allotmentConfirmed: ipo.allotmentConfirmed })
              : <MissingValue />}
          </Fact>
          <Fact label="Price band">
            {ipo ? <PriceBand lowRupees={ipo.offer.priceBand.lowRupees} highRupees={ipo.offer.priceBand.highRupees} /> : <MissingValue />}
          </Fact>
          <Fact label="Issue size">
            {ipo && isPresentNumber(ipo.offer.issueSizeRupees) ? formatInrScale(ipo.offer.issueSizeRupees) : <MissingValue />}
          </Fact>
          <Fact label="Lot size">{ipo ? <LotSize shares={ipo.offer.lotSizeShares} /> : <MissingValue label="Lot size unavailable" />}</Fact>
          <Fact label="Minimum investment">{ipo ? <MinimumInvestment offer={ipo.offer} /> : <MissingValue />}</Fact>
        </FactList>
      </Card>
      <section className="grid gap-3" aria-labelledby="about-company">
        <h3 id="about-company" className="text-base font-semibold text-foreground">
          About company
        </h3>
        {profile?.about || profile?.description ? (
          <>
            {profile.about ? <p className="max-w-3xl text-sm leading-6 text-foreground">{profile.about}</p> : null}
            {profile.description ? <p className="max-w-3xl text-sm leading-6 text-muted">{profile.description}</p> : null}
          </>
        ) : (
          <p className="text-sm text-muted">Company overview is unavailable until a stored details_full profile is present.</p>
        )}
      </section>
      {(profile?.strengths?.length || profile?.risks?.length) ? (
        <div className="grid gap-4 md:grid-cols-2">
          <NarrativeList title="Strengths" items={profile?.strengths ?? []} />
          <NarrativeList title="Risks" items={profile?.risks ?? []} />
        </div>
      ) : null}
      <PromoterList ipo={ipo} />
      <ObjectsList ipo={ipo} />
    </section>
  );
}

function NarrativeList({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) {
    return (
      <div className="grid gap-2 rounded-panel border border-border bg-surface p-4">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-sm text-muted">Not available in the stored profile.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-2 rounded-panel border border-border bg-surface p-4">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <ul className="grid gap-2 text-sm leading-6 text-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function PromoterList({ ipo }: { ipo: Ipo | null }) {
  const promoters = ipo?.profile?.promoters ?? [];
  const narrative = ipo?.profile?.promoterNarrative ?? null;
  if (promoters.length === 0 && !narrative) return null;
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium text-foreground">Promoters</h3>
      {narrative ? <p className="max-w-3xl text-sm leading-6 text-foreground">{narrative}</p> : null}
      {promoters.length > 0 ? (
        <ul className="grid gap-2 text-sm leading-6 text-foreground">
          {promoters.map((promoter) => (
            <li key={promoter.name}>
              {promoter.name}
              {promoter.profile ? <span className="text-muted"> — {promoter.profile}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ObjectsList({ ipo }: { ipo: Ipo | null }) {
  const objects = ipo?.profile?.objectsOfIssue;
  if (!objects || (objects.items.length === 0 && !objects.text)) return null;
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium text-foreground">Objects of the issue</h3>
      {objects.items.length > 0 ? (
        <ul className="grid gap-2 text-sm leading-6 text-foreground">
          {objects.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="max-w-3xl text-sm leading-6 text-foreground">{objects.text}</p>
      )}
    </div>
  );
}
