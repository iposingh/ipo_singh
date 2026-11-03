import type { Metadata } from "next";
import { AccessDenied } from "@/features/admin/access-denied";

export const metadata: Metadata = {
  title: "Access denied",
  robots: { index: false, follow: false },
};

export default function AdminDeniedPage() {
  return <AccessDenied />;
}
