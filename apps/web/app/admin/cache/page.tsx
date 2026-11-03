import type { Metadata } from "next";
import { CachePanel } from "@/features/admin/cache-panel";

export const metadata: Metadata = { title: "Cache" };

export default function AdminCachePage() {
  return <CachePanel />;
}
