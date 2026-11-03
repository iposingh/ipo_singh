export const primaryTabs = [
  { route: "index", title: "Home", accessibilityLabel: "IPO Singh home dashboard", icon: "home" },
  { route: "ipos", title: "IPOs", accessibilityLabel: "IPO listings and search", icon: "list" },
  { route: "watchlist", title: "Watchlist", accessibilityLabel: "Watchlist", icon: "bookmark" },
  { route: "notifications", title: "Alerts", accessibilityLabel: "Notifications", icon: "notifications" },
  { route: "settings", title: "Settings", accessibilityLabel: "Settings", icon: "settings" },
] as const;

export type PrimaryTab = (typeof primaryTabs)[number];

export function primaryTabTitles(): string[] {
  return primaryTabs.map((tab) => tab.title);
}
