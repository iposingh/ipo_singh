import type { Ipo } from "@ipo-singh/contracts";
import { MissingValue } from "@/components/financial/missing-value";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Fact, FactList } from "@/features/ipo-details/fact-list";
import { allotmentLink } from "@/features/allotment/link";
import { IndiaDate } from "@/features/ipos/ipo-facts";

export function AllotmentSection({ ipo }: { ipo: Ipo | null }) {
  const confirmed = ipo?.allotmentConfirmed === true;
  const link = allotmentLink(ipo?.registrar?.allotmentUrl, {
    confirmed,
    registrarName: ipo?.registrar?.name,
  });

  return (
    <section className="grid gap-4" aria-labelledby="ipo-allotment">
      <SectionHeader id="ipo-allotment" title="Allotment" />
      <Card className="grid gap-4">
        <FactList>
          <Fact label="Status">{confirmed ? "Allotment Out" : "Allotment Awaited"}</Fact>
          <Fact label="Allotment date">{ipo ? <IndiaDate value={ipo.dates.allotmentDate} /> : <MissingValue label="Date unavailable" />}</Fact>
          <Fact label="Registrar">{ipo?.registrar?.name ? ipo.registrar.name : <MissingValue label="Registrar unavailable" />}</Fact>
        </FactList>
        {link.href ? (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-fit items-center justify-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground"
          >
            Check Allotment
          </a>
        ) : (
          <Button disabled className="w-fit">
            Check Allotment
          </Button>
        )}
        <p className="text-sm leading-6 text-muted">{link.note}</p>
      </Card>
    </section>
  );
}
