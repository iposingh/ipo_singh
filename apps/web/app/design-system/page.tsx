import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { DesignSystemView } from "@/features/design-system/design-system-view";

export const metadata: Metadata = pageMetadata({
  title: "Design system",
  description: "Internal Growth Arrow Green design system showcase. Illustrative sample data only.",
  path: "/design-system",
  index: false,
  follow: false,
});

export default function DesignSystemPage() {
  return (
    <main id="main-content" className="flex flex-1 flex-col">
      <DesignSystemView />
    </main>
  );
}
