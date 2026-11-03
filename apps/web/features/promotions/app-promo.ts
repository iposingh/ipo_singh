export const appPromoDismissKey = "ipo-singh-app-promo";

export type StoreName = "google-play" | "app-store";

export type StoreDestination =
  | { store: StoreName; label: string; status: "ready"; url: string }
  | { store: StoreName; label: string; status: "coming-soon" };

export type AppPromotion = {
  name: string;
  summary: string;
  stores: readonly StoreDestination[];
};

const storeHosts: Record<StoreName, string> = {
  "google-play": "play.google.com",
  "app-store": "apps.apple.com",
};

export function currentAppPromotion(): AppPromotion {
  return appPromotionFromEnv({
    play: process.env.IPO_SINGH_PLAY_STORE_URL,
    apple: process.env.IPO_SINGH_APP_STORE_URL,
  });
}

export function appPromotionFromEnv(env: { play?: string; apple?: string }): AppPromotion {
  return {
    name: "IPO Singh",
    summary: "A mobile app is planned. Store links appear here only after each app is published.",
    stores: [
      storeDestination("google-play", "Google Play", env.play),
      storeDestination("app-store", "App Store", env.apple),
    ],
  };
}

export function storeDestination(store: StoreName, label: string, value: string | undefined): StoreDestination {
  const url = publishedStoreUrl(store, value);
  if (!url) return { store, label, status: "coming-soon" };
  return { store, label, status: "ready", url };
}

export function publishedStoreUrl(store: StoreName, value: string | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hash !== "") return null;
  const host = url.hostname.toLowerCase();
  if (host !== storeHosts[store]) return null;
  if (url.pathname === "/" || url.pathname === "") return null;
  return url.toString();
}

export function appPromoDismissed(storage: { getItem(key: string): string | null } | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(appPromoDismissKey) === "dismissed";
  } catch {
    return false;
  }
}

export const appPromoInitScript = `(function(){try{if(sessionStorage.getItem(${JSON.stringify(appPromoDismissKey)})==="dismissed"){document.documentElement.dataset.appPromo="dismissed";}}catch(e){}})();`;
