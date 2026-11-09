export const primaryTabs = [
  { route: "index", title: "Mainboard", accessibilityLabel: "Mainboard IPOs", icon: "list" as const },
  { route: "sme", title: "SME", accessibilityLabel: "SME IPOs", icon: "list" as const },
  { route: "calendar", title: "Calendar", accessibilityLabel: "IPO calendar", icon: "calendar" as const },
  { route: "news", title: "News", accessibilityLabel: "News", icon: "newspaper" as const },
  { route: "settings", title: "Settings", accessibilityLabel: "Settings", icon: "settings" as const },
] as const;

export type PrimaryTab = (typeof primaryTabs)[number];

export function primaryTabTitles(): string[] {
  return primaryTabs.map((tab) => tab.title);
}
