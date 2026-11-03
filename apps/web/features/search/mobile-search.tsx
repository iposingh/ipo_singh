"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";
import Link from "next/link";
import { SearchBox } from "./search-box";

export function MobileSearch() {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="inline-flex size-11 items-center justify-center rounded-control border border-border bg-surface text-sm font-medium text-foreground lg:hidden"
        aria-label="Search"
      >
        <span aria-hidden>⌕</span>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#0F172A]/40" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto bg-surface p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground">
          <div className="flex items-start justify-between gap-4">
            <DialogPrimitive.Title className="text-lg font-semibold">Search IPOs</DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="inline-flex size-11 items-center justify-center rounded-control hover:bg-background"
              aria-label="Close search"
            >
              ×
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="text-sm leading-6 text-muted">
            Search stored issues by company name or symbol. Filters for board, status, and dates are on the search page.
          </DialogPrimitive.Description>
          <SearchBox
            id="mobile-search"
            showSubmit
            placement="inline"
            label="Company name or symbol"
            labelVisibility="visible"
            autoFocus
            onNavigate={() => setOpen(false)}
          />
          <Link href="/search" className="text-sm text-link underline" onClick={() => setOpen(false)}>
            Open the search page
          </Link>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
