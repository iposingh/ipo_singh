import type { Metadata } from "next";
import { BannerEditor } from "@/features/admin/banner-editor";

export const metadata: Metadata = { title: "New banner" };

export default function NewBannerPage() {
  return <BannerEditor />;
}
