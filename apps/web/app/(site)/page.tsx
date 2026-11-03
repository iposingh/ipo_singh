import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { HomeView } from "@/features/home/home-view";
import { IpoListSkeleton } from "@/features/ipos/ipo-list-skeleton";
import { pageMetadata } from "@/lib/seo/metadata";

const description =
  "IPO Singh brings stored Indian Mainboard and SME IPO listings, calendars, and issue pages into one place. Lists stay empty when none are stored.";

export const metadata: Metadata = pageMetadata({
  title: { absolute: "IPO Singh | All IPO Insights. One Place." },
  description,
  path: "/",
});

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <IpoListSkeleton label="Loading Mainboard IPOs" />
        </PageContainer>
      }
    >
      <HomeView />
    </Suspense>
  );
}
