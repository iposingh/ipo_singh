import type { Metadata } from "next";
import { MissingIpo } from "@/features/ipos/missing-ipo";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "IPO not found",
  description: "No stored IPO uses this address. IPO Singh did not substitute another company.",
  path: "/",
  canonical: null,
  index: false,
  follow: false,
});

/** Direct URL for the missing-IPO document. Production missing slugs are answered by `proxy.ts` with HTTP 404. */
export default function IpoUnavailablePage() {
  return <MissingIpo />;
}
