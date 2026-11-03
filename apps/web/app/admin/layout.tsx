import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  AdminGateOverlay,
  AdminHeaderBar,
  AdminSessionProvider,
  AdminSideNav,
} from "@/features/admin/admin-shell";

export const metadata: Metadata = {
  title: {
    default: "Administration",
    template: "%s | IPO Singh",
  },
  robots: { index: false, follow: false },
};

/**
 * Page segments stay in this Server layout's `{children}` slot. Session chrome
 * is sibling Client Components so Cache Components can validate instant
 * navigation (https://nextjs.org/docs/messages/instant-unrendered-segment).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminSessionProvider>
      <div className="relative flex min-h-full flex-1 flex-col bg-background">
        <AdminHeaderBar />
        <div className="flex min-h-full flex-1 flex-col lg:flex-row">
          <AdminSideNav />
          <div id="main-content" className="relative flex min-w-0 flex-1 flex-col gap-4 px-4 py-6">
            {children}
          </div>
        </div>
        <AdminGateOverlay />
      </div>
    </AdminSessionProvider>
  );
}
