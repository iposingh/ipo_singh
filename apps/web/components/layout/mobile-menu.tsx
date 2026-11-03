"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";
import { SiteNav } from "@/components/layout/site-nav";
import { IconButton } from "@/components/ui/icon-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SearchBox } from "@/features/search/search-box";
import { accountNav, primaryNav } from "@/lib/navigation/routes";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const closeAfterNavigation = () => {
    window.setTimeout(() => setOpen(false), 0);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <IconButton aria-label="Open menu" variant="secondary">
          <span aria-hidden className="flex w-4 flex-col gap-1">
            <span className="block h-0.5 bg-current" />
            <span className="block h-0.5 bg-current" />
            <span className="block h-0.5 bg-current" />
          </span>
        </IconButton>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#0F172A]/40" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(100%,20rem)] flex-col gap-6 overflow-y-auto border-r border-border bg-surface p-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] text-foreground shadow-card">
          <div className="flex items-start justify-between gap-4">
            <DialogPrimitive.Title className="text-lg font-semibold">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="inline-flex size-11 items-center justify-center rounded-control hover:bg-background"
              aria-label="Close menu"
            >
              ×
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Mainboard IPOs, SME IPOs, calendar, compare, allotment, search, theme, account, and watchlist.
          </DialogPrimitive.Description>
          <SearchBox
            id="mobile-menu-search"
            label="Search IPOs"
            labelVisibility="visible"
            showSubmit
            placement="inline"
            onNavigate={closeAfterNavigation}
          />
          <SiteNav
            items={primaryNav}
            label="Primary"
            listClassName="grid"
            linkClassName="w-full justify-start"
            onNavigate={closeAfterNavigation}
          />
          <SiteNav
            items={accountNav}
            label="Account"
            listClassName="grid"
            linkClassName="w-full justify-start"
            onNavigate={closeAfterNavigation}
          />
          <ThemeToggle />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
