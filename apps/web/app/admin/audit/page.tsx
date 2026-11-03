import type { Metadata } from "next";
import { AuditPanel } from "@/features/admin/audit-panel";

export const metadata: Metadata = {
  title: "Audit log",
  robots: { index: false, follow: false },
};

export default function AdminAuditPage() {
  return <AuditPanel />;
}
