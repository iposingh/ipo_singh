"use client";

import { SiteNav } from "@/components/layout/site-nav";
import { bottomNav } from "@/lib/navigation/routes";

export function BottomNav() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <SiteNav
        items={bottomNav}
        label="Sections"
        compact
        className="mx-auto max-w-[70rem]"
        listClassName="grid grid-cols-5 gap-0 px-1"
        linkClassName="w-full justify-center px-1 text-xs"
      />
    </div>
  );
}
