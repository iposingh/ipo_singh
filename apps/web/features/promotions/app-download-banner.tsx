import type { AppPromotion, StoreDestination } from "@/features/promotions/app-promo";

export function AppDownloadBanner({ promo }: { promo: AppPromotion }) {
  return (
    <section id="ipo-singh-app" aria-label="IPO Singh app" className="grid gap-4 rounded-panel border border-border bg-surface p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      <AppMark />
      <div className="grid gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-link uppercase">Mobile app</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{promo.name} app</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{promo.summary}</p>
        </div>
        <StoreActions stores={promo.stores} />
      </div>
    </section>
  );
}

export function StoreActions({ stores }: { stores: readonly StoreDestination[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {stores.map((store) => (
        <li key={store.store}>
          {store.status === "ready" ? (
            <a href={store.url} className="inline-flex h-11 items-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground">
              View on {store.label}
            </a>
          ) : (
            <p className="inline-flex h-11 items-center rounded-control border border-border px-4 text-sm font-medium text-muted">
              {store.label}: Coming soon
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function AppMark() {
  return (
    <span className="inline-flex h-16 w-16 items-center justify-center rounded-panel bg-primary-solid text-primary-foreground" aria-hidden="true">
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <rect x="4" y="18" width="6" height="12" rx="1.5" fill="currentColor" opacity="0.8" />
        <rect x="14" y="12" width="6" height="18" rx="1.5" fill="currentColor" opacity="0.9" />
        <rect x="24" y="6" width="6" height="24" rx="1.5" fill="currentColor" />
        <path d="M25 5l4-4 4 4h-2.5v4h-3V5z" fill="currentColor" />
      </svg>
    </span>
  );
}
