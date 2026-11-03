import type { Metadata } from "next";
import { InfoPage } from "@/features/placeholders/info-page";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Disclaimer",
  description: "IPO Singh shows stored IPO figures and is not investment advice. A missing figure is not zero.",
  path: "/disclaimer",
});

export default function DisclaimerPage() {
  return (
    <InfoPage title="Disclaimer" description="Nothing on IPO Singh is investment advice.">
      <p>
        IPO pages show figures stored by IPO Singh. A missing figure stays unavailable and is not shown as zero. GMP is
        unofficial and indicative. When a figure is present, the page names its source and shows when it was updated.
      </p>
    </InfoPage>
  );
}