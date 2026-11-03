import type { Ipo } from "@ipo-singh/contracts";
import { isPresentNumber } from "@ipo-singh/core";
import { InrPrice } from "@/components/financial/inr-price";
import { MissingValue } from "@/components/financial/missing-value";
import { SignedChange } from "@/components/financial/signed-change";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Fact, FactList } from "@/features/ipo-details/fact-list";
import { IndiaDate } from "@/features/ipos/ipo-facts";
import { actualListingPerformance } from "@/features/ipos/listed";

export function ListingSection({ ipo }: { ipo: Ipo | null }) {
  const facts = ipo ? actualListingPerformance(ipo) : null;
  const listing = ipo?.listing ?? null;
  const profile = ipo?.profile ?? null;

  return (
    <section className="grid gap-4" aria-labelledby="ipo-listing">
      <SectionHeader
        id="ipo-listing"
        title="Listing performance"
        description="This is the actual change from the issue price to the listing price. It is separate from the unofficial GMP estimate. A missing price stays unavailable."
      />
      <Card className="p-0 px-5">
        <FactList>
          <Fact label="Listing date">{ipo ? <IndiaDate value={ipo.dates.listingDate} /> : <MissingValue label="Date unavailable" />}</Fact>
          <Fact label="Issue price">
            {isPresentNumber(facts?.issuePriceRupees) ? <InrPrice value={facts.issuePriceRupees} /> : <MissingValue label="Issue price unavailable" />}
          </Fact>
          <Fact label="Listing price">
            {listing ? <InrPrice value={facts?.listingPriceRupees} /> : <MissingValue label="Listing price unavailable" />}
          </Fact>
          <Fact label="Listing performance">
            {facts && facts.gainPercent !== null ? <SignedChange percent={facts.gainPercent} /> : <MissingValue label="Listing performance unavailable" />}
          </Fact>
          <Fact label="Current price">
            {profile ? <InrPrice value={profile.cmpRupees} /> : <MissingValue label="Current price unavailable" />}
          </Fact>
          <Fact label="Change since listing">
            {profile && profile.currentGainPercent !== null ? (
              <SignedChange percent={profile.currentGainPercent} />
            ) : (
              <MissingValue label="Change since listing unavailable" />
            )}
          </Fact>
        </FactList>
      </Card>
    </section>
  );
}
