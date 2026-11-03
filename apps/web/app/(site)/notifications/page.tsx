import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Notifications",
  description: "In-app notifications for a signed-in IPO Singh account. Email and SMS are not sent. Phone reminders go only to a registered device that opted in.",
  path: "/notifications",
  index: false,
  follow: false,
});

export default function NotificationsPage() {
  return (
    <PageContainer className="grid max-w-3xl gap-6">
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Notifications" }]} />
      <PageHeader
        title="Notifications"
        description="In-app notices for saved IPOs. A notice is created from stored dates and readings. Email and SMS are not sent. Phone reminders go only to a registered device that opted in."
      />
      <NotificationCenter />
    </PageContainer>
  );
}
