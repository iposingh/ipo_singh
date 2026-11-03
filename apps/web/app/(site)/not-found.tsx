import type { Metadata } from "next";
import { MissingIpo } from "@/features/ipos/missing-ipo";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Page not found",
  description: "That page is not available on IPO Singh. No sample company was substituted.",
  path: "/",
  canonical: null,
  index: false,
  follow: false,
});

export default function NotFound() {
  return <MissingIpo />;
}
