import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { stableIdSchema } from "@ipo-singh/contracts";
import { ActionLink } from "@/components/layout/action-link";
import { PageContainer } from "@/components/layout/page-container";
import { ErrorState } from "@/components/ui/error-state";
import { IpoDetailView } from "@/features/ipo-details/ipo-detail-view";
import { loadIpoDetail } from "@/features/ipos/catalog";
import { detailDescription } from "@/lib/seo/copy";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!stableIdSchema.safeParse(slug).success) {
    return pageMetadata({
      title: "IPO not found",
      description: "No stored IPO uses this address. IPO Singh did not substitute another company.",
      path: "/ipos/mainboard",
      canonical: null,
      index: false,
      follow: false,
    });
  }
  const loaded = await loadIpoDetail(slug);
  if (loaded.status === "missing") {
    return pageMetadata({
      title: "IPO not found",
      description: "No stored IPO uses this address. IPO Singh did not substitute another company.",
      path: `/ipos/${slug}`,
      canonical: null,
      index: false,
      follow: false,
    });
  }
  if (loaded.status !== "ready") {
    return pageMetadata({
      title: "IPO",
      description: "This IPO could not be loaded. No sample figures were substituted.",
      path: `/ipos/${slug}`,
      canonical: null,
      index: false,
      follow: false,
    });
  }
  const ipo = loaded.detail.ipo;
  return pageMetadata({
    title: `${ipo.companyName} IPO`,
    description: detailDescription(ipo),
    path: `/ipos/${ipo.slug}`,
  });
}

/** Await the catalogue before rendering so missing slugs return HTTP 404 (not a soft 200 shell). */
export default async function IpoDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!stableIdSchema.safeParse(slug).success) notFound();
  const loaded = await loadIpoDetail(slug);
  if (loaded.status === "missing") notFound();
  if (loaded.status === "unavailable") {
    return (
      <PageContainer>
        <ErrorState
          title="This IPO could not be loaded"
          message="The IPO Singh catalogue could not be read. No sample figures were substituted."
          action={
            <ActionLink href={`/ipos/${encodeURIComponent(slug)}`} variant="secondary">
              Try again
            </ActionLink>
          }
        />
      </PageContainer>
    );
  }
  return <IpoDetailView detail={loaded.detail} />;
}
