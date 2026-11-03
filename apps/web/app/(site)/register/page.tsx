import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AuthForm } from "@/features/auth/auth-form";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Create an account",
  description: "Create an IPO Singh account with an email and password. No verification email is sent.",
  path: "/register",
  index: false,
  follow: false,
});

export default function RegisterPage() {
  return (
    <PageContainer className="grid max-w-xl gap-6">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/account", label: "Account" }, { label: "Create account" }]} />
      <PageHeader
        title="Create an account"
        description="Use an email and a password. IPO Singh does not send a verification email or a password reset email."
      />
      <Suspense fallback={null}>
        <AuthForm mode="register" />
      </Suspense>
    </PageContainer>
  );
}
