"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { safeReturnPath } from "@/features/auth/return-path";
import { useWatchlist } from "@/features/watchlist/watchlist-provider";

export function WatchlistButton({ ipoId, companyName }: { ipoId: string; companyName: string }) {
  const { status, items, toggle } = useWatchlist();
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const saved = items.some((item) => item.ipoId === ipoId);
  const label = saved ? `Remove ${companyName} from the watchlist` : `Save ${companyName} to the watchlist`;
  const query = search.toString();
  const here = safeReturnPath(query ? `${pathname}?${query}` : pathname) ?? "/";
  const next = encodeURIComponent(here);

  function onToggle() {
    setBusy(true);
    setMessage(null);
    void toggle(ipoId)
      .then((result) => {
        if (result === "guest") setOpen(true);
        if (result === "error") setMessage("The watchlist could not be updated.");
      })
      .finally(() => setBusy(false));
  }

  return (
    <div className="grid justify-items-end gap-1">
      <button
        type="button"
        className={`inline-flex size-11 items-center justify-center rounded-control border ${saved ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground"}`}
        aria-pressed={status === "ready" ? saved : undefined}
        aria-label={label}
        disabled={busy || status === "loading"}
        onClick={() => {
          if (status === "guest") {
            setOpen(true);
            return;
          }
          onToggle();
        }}
      >
        <BookmarkIcon filled={saved} />
      </button>
      {message ? (
        <p role="alert" className="text-sm text-negative-text">
          {message}
        </p>
      ) : null}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-[#0F172A]/40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 grid w-[min(100%-2rem,28rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-panel border border-border bg-surface p-5 text-foreground shadow-card">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-lg font-semibold">Save this IPO</Dialog.Title>
              <Dialog.Close className="inline-flex size-11 items-center justify-center rounded-control hover:bg-background" aria-label="Close dialog">
                ×
              </Dialog.Close>
            </div>
            <Dialog.Description className="text-sm leading-6 text-muted">Sign in to save IPOs to your watchlist.</Dialog.Description>
            <div className="grid gap-3">
              <Link href={`/login?next=${next}`} className="inline-flex h-11 items-center justify-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground">
                Sign In
              </Link>
              <Link href={`/register?next=${next}`} className="inline-flex h-11 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-medium text-foreground">
                Create Account
              </Link>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3-6 3V5a1 1 0 0 1 1-1z" />
    </svg>
  );
}
