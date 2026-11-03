import type { Metadata } from "next";
import { ProviderPanel } from "@/features/admin/provider-panel";

export const metadata: Metadata = {
  title: "Provider",
  robots: { index: false, follow: false },
};

export default function AdminProviderPage() {
  return <ProviderPanel />;
}
