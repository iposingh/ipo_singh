import { ActionLink } from "@/components/layout/action-link";
import { PageContainer } from "@/components/layout/page-container";

export function MissingIpo() {
  return (
    <PageContainer className="grid gap-6 py-8">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">This IPO page is not available</h1>
      <p className="max-w-2xl text-base leading-7 text-muted">
        No stored issue uses this address. IPO Singh did not substitute another company.
      </p>
      <div className="flex flex-wrap gap-3">
        <ActionLink href="/">Home</ActionLink>
        <ActionLink href="/ipos/mainboard" variant="secondary">
          Mainboard IPOs
        </ActionLink>
        <ActionLink href="/ipos/sme" variant="secondary">
          SME IPOs
        </ActionLink>
      </div>
    </PageContainer>
  );
}
