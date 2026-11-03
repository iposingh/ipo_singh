import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { BannerEditor } from "@/features/admin/banner-editor";

export const metadata: Metadata = { title: "Edit banner" };

const bannerIdPattern = /^banner-[a-f0-9]{16}$/;

type PageProps = {
  params: Promise<{ bannerId: string }>;
};

async function EditBannerBody({ params }: PageProps) {
  const { bannerId } = await params;
  if (!bannerIdPattern.test(bannerId)) {
    return <EmptyState title="That banner was not found." description="Open a banner from the list." />;
  }
  return <BannerEditor bannerId={bannerId} />;
}

export default function EditBannerByIdPage(props: PageProps) {
  return (
    <Suspense fallback={<LoadingState label="Loading banner" />}>
      <EditBannerBody {...props} />
    </Suspense>
  );
}
