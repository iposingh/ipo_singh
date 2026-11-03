import type { Metadata } from "next";
import { AccountsPanel } from "@/features/admin/accounts-panel";

export const metadata: Metadata = { title: "Accounts" };

export default function AdminAccountsPage() {
  return <AccountsPanel />;
}
