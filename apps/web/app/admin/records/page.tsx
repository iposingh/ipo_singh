import type { Metadata } from "next";
import { RecordsPanel } from "@/features/admin/records-panel";

export const metadata: Metadata = { title: "Records" };

export default function AdminRecordsPage() {
  return <RecordsPanel />;
}
