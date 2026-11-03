import type { Metadata } from "next";
import { BannersPanel } from "@/features/admin/banners-panel";

export const metadata: Metadata = { title: "Banners" };

export default function AdminBannersPage() {
  return <BannersPanel />;
}
