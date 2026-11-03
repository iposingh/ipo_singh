import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { SiteNav } from "@/components/layout/site-nav";
import { SiteSearch } from "@/components/layout/site-search";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { MobileSearch } from "@/features/search/mobile-search";
import { accountNav, primaryNav } from "@/lib/navigation/routes";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex w-full max-w-[70rem] items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <div className="lg:hidden">
          <MobileMenu />
        </div>
        <Link href="/" aria-label="IPO Singh home" className="shrink-0 rounded-control">
          <BrandLogo width={148} priority />
        </Link>
        <div className="ml-auto hidden min-w-0 items-center gap-3 lg:flex">
          <SiteSearch className="w-64" />
          <SiteNav items={accountNav} label="Account" />
          <NotificationBell />
          <ThemeToggle />
        </div>
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <NotificationBell />
          <MobileSearch />
        </div>
      </div>
      <div className="mx-auto hidden w-full max-w-[70rem] px-8 pb-2 lg:block">
        <SiteNav items={primaryNav} label="Primary" />
      </div>
    </header>
  );
}
