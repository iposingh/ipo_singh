"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOutAdmin } from "@/features/admin/admin-session";

export function AccessDenied() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await signOutAdmin();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <Card className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-foreground">Access denied</h1>
      <p className="mt-2 text-sm leading-6 text-muted">This account is not an administrator. IPO pages stay available without this sign-in.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" variant="secondary" loading={pending} onClick={() => void signOut()}>
          Sign out
        </Button>
        <Link href="/" className="inline-flex h-11 items-center text-sm text-link underline">
          View the public site
        </Link>
      </div>
    </Card>
  );
}
