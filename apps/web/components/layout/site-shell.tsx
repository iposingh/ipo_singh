import type { ReactNode } from "react";
import { OfflineNotice } from "@/components/layout/offline-notice";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PreferenceSync } from "@/features/account/preference-sync";
import { WatchlistProvider } from "@/features/watchlist/watchlist-provider";
import { currentAppPromotion } from "@/features/promotions/app-promo";
import { AppPromoChrome } from "@/features/promotions/app-promo-chrome";

type SiteShellProps = {
  children: ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  const promo = currentAppPromotion();
  return (
    <WatchlistProvider>
      <div className="flex min-h-full flex-1 flex-col">
        <PreferenceSync />
        <SiteHeader />
        <AppPromoChrome promo={promo} />
        <OfflineNotice />
        <main id="main-content" className="flex-1 pb-4 lg:pb-0">
          {children}
        </main>
        <SiteFooter />
        <BottomNav />
      </div>
    </WatchlistProvider>
  );
}
