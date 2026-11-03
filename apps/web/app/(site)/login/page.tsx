import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AuthForm } from "@/features/auth/auth-form";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Sign in",
  description: "Sign in to an IPO Singh account. Email verification is not used.",
  path: "/login",
  index: false,
  follow: false,
});

export default function LoginPage() {
  return (
    <PageContainer className="grid max-w-xl gap-6">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/account", label: "Account" }, { label: "Sign in" }]} />
      <PageHeader
        title="Sign in"
        description="IPO pages stay available without an account. Email verification and password reset emails are not sent."
      />
      <Suspense fallback={null}>
        <AuthForm mode="login" />
      </Suspense>
    </PageContainer>
  );
}
