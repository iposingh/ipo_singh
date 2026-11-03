import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AccountPanel } from "@/features/auth/account-panel";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Account",
  description: "Your IPO Singh account. Browsing IPO pages does not require a sign-in.",
  path: "/account",
  index: false,
  follow: false,
});

export default function AccountPage() {
  return (
    <PageContainer className="grid max-w-xl gap-6">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Account" }]} />
      <PageHeader title="Account" description="Sign in is optional. Public IPO pages stay open without an account." />
      <AccountPanel />
    </PageContainer>
  );
}
