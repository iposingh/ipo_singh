import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

type PlaceholderPageProps = {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  action?: ReactNode;
};

export function PlaceholderPage({ title, description, emptyTitle, emptyDescription, action }: PlaceholderPageProps) {
  return (
    <PageContainer className="grid gap-6">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: title }]} />
      <PageHeader title={title} description={description} />
      <EmptyState title={emptyTitle} description={emptyDescription} action={action} />
    </PageContainer>
  );
}
