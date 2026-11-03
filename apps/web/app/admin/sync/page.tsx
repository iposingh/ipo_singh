import type { Metadata } from "next";
import { SyncPanel } from "@/features/admin/sync-panel";

export const metadata: Metadata = { title: "Sync" };

export default function AdminSyncPage() {
  return <SyncPanel />;
}
