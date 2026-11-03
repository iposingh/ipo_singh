import Link from "next/link";
import { Card } from "@/components/ui/card";

export function SessionExpired() {
  return (
    <Card className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-foreground">Session expired</h1>
      <p className="mt-2 text-sm leading-6 text-muted">Your session has expired. Sign in again to continue.</p>
      <Link href="/admin/login" className="mt-4 inline-flex h-11 items-center text-sm text-link underline">
        Sign in
      </Link>
    </Card>
  );
}
