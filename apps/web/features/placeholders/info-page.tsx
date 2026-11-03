import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

type InfoPageProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function InfoPage({ title, description, children }: InfoPageProps) {
  return (
    <PageContainer className="grid gap-6">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: title }]} />
      <PageHeader title={title} description={description} />
      <div className="grid max-w-2xl gap-4 text-sm leading-6 text-foreground">{children}</div>
    </PageContainer>
  );
}
