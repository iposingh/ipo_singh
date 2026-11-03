import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { ActionLink } from "@/components/layout/action-link";
import { PlaceholderPage } from "@/features/placeholders/placeholder-page";

export const metadata: Metadata = pageMetadata({
  title: "GMP",
  description: "Grey market premium is shown on each IPO. This address is not a separate GMP catalogue.",
  path: "/gmp",
  index: false,
  follow: false,
});

export default function GmpPage() {
  return (
    <PlaceholderPage
      title="GMP"
      description="Grey market premium belongs on the individual IPO page, in rupees and as a derived percentage."
      emptyTitle="Open an IPO to see GMP"
      emptyDescription="This page does not redirect to an unrelated IPO and does not show a premium of ₹0. A missing GMP on an IPO page is unavailable."
      action={
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ActionLink href="/ipos/mainboard">Mainboard IPOs</ActionLink>
          <ActionLink href="/ipos/sme" variant="secondary">
            SME IPOs
          </ActionLink>
        </div>
      }
    />
  );
}
