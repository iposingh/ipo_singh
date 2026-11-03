"use client";

import Link from "next/link";
import { appPromoDismissKey, type AppPromotion } from "@/features/promotions/app-promo";
import { StoreActions } from "@/features/promotions/app-download-banner";

export function AppPromoChrome({ promo }: { promo: AppPromotion }) {
  function dismiss() {
    try {
      sessionStorage.setItem(appPromoDismissKey, "dismissed");
    } catch {
      // The current page still hides the prompt when storage is blocked.
    }
    document.documentElement.dataset.appPromo = "dismissed";
  }

  return (
    <>
      <div className="app-promo-chrome hidden border-b border-border bg-surface lg:block">
        <div className="mx-auto flex w-full max-w-[70rem] items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
          <p className="text-sm text-foreground">
            <span className="font-semibold">{promo.name} app.</span>{" "}
            <span className="text-muted">{comingSoonLine(promo)}</span>
          </p>
          <div className="flex items-center gap-2">
            {promo.stores.some((store) => store.status === "ready") ? (
              <StoreActions stores={promo.stores.filter((store) => store.status === "ready")} />
            ) : null}
            <DismissButton onDismiss={dismiss} />
          </div>
        </div>
      </div>
      <div className="app-promo-chrome fixed inset-x-0 z-40 border-t border-border bg-surface lg:hidden bottom-[calc(2.75rem+env(safe-area-inset-bottom))]">
        <div className="flex h-[3.25rem] items-center justify-between gap-3 px-3">
          <p className="min-w-0 truncate text-sm text-foreground">
            <span className="font-semibold">{promo.name} app</span>
            <span className="text-muted"> · {compactStatus(promo)}</span>
          </p>
          <Link href="/#ipo-singh-app" className="shrink-0 text-sm font-medium text-link underline">
            Details
          </Link>
          <DismissButton onDismiss={dismiss} />
        </div>
      </div>
    </>
  );
}

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button type="button" className="inline-flex h-11 shrink-0 items-center rounded-control px-3 text-sm font-medium text-muted hover:bg-background hover:text-foreground" onClick={onDismiss}>
      Dismiss
    </button>
  );
}

function comingSoonLine(promo: AppPromotion): string {
  const ready = promo.stores.filter((store) => store.status === "ready");
  if (ready.length === 0) return "Coming soon. The apps are not published yet.";
  return `Available on ${ready.map((store) => store.label).join(" and ")}.`;
}

function compactStatus(promo: AppPromotion): string {
  const ready = promo.stores.some((store) => store.status === "ready");
  return ready ? "View in the app stores" : "Coming soon";
}
