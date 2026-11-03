import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { ActionLink } from "@/components/layout/action-link";
import { PlaceholderPage } from "@/features/placeholders/placeholder-page";

export const metadata: Metadata = pageMetadata({
  title: "Subscription",
  description: "Subscription is shown on each IPO. This address is not a separate subscription catalogue.",
  path: "/subscription",
  index: false,
  follow: false,
});

export default function SubscriptionPage() {
  return (
    <PlaceholderPage
      title="Subscription"
      description="Retail, QIB, NII and total subscription belong on the individual IPO page."
      emptyTitle="Open an IPO to see subscription"
      emptyDescription="This page does not redirect to an unrelated IPO and does not show a multiple of 0x. A missing subscription is unavailable."
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
