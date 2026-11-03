import { PageContainer } from "@/components/layout/page-container";
import { LoadingState } from "@/components/ui/loading-state";

export default function SiteLoading() {
  return (
    <PageContainer>
      <LoadingState label="Loading page" />
    </PageContainer>
  );
}
