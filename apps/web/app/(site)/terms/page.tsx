import type { Metadata } from "next";
import { InfoPage } from "@/features/placeholders/info-page";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Terms",
  description: "Terms for using the IPO Singh website. An account is optional. Paid features are not open.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <InfoPage title="Terms" description="Browsing IPO pages does not require an account.">
      <p>
        Creating an account is optional. IPO pages show stored figures and say when a figure or the catalogue is
        unavailable. A missing figure is not shown as zero. Email verification and password reset emails are not sent.
      </p>
    </InfoPage>
  );
}
