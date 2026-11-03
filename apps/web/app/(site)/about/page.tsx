import type { Metadata } from "next";
import { InfoPage } from "@/features/placeholders/info-page";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description: "IPO Singh is a place for stored Indian IPO listings, calendars, and individual issue pages.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <InfoPage
      title="About"
      description="IPO Singh is being built as one place for Indian IPO insight."
    >
      <p>
        Mainboard and SME lists, search, the IPO calendar, and each IPO page read issues stored by IPO Singh. They stay
        empty when nothing is stored, and they show an error when that catalogue cannot be read. The browser does not
        call a market-data vendor, and missing figures are not invented.
      </p>
      <p>
        Grey market premium and subscription are shown on the individual IPO page. GMP is unofficial and indicative.
        An account is optional and is not required to browse IPO pages. A signed-in watchlist stores IPO ids and reads current details from the catalogue.
      </p>
    </InfoPage>
  );
}
