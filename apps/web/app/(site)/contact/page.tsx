import type { Metadata } from "next";
import { InfoPage } from "@/features/placeholders/info-page";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description: "Contact IPO Singh. A public contact address is not published yet.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <InfoPage title="Contact" description="A public contact address is not published on this page yet.">
      <p>When a contact method is ready, it will be listed here. This page does not accept messages.</p>
    </InfoPage>
  );
}
