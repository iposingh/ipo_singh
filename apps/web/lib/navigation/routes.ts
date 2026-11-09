export type SiteRoute = {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  badge?: string;
};

export const primaryNav = [
  {
    href: "/ipos/mainboard",
    label: "Mainboard IPOs",
    shortLabel: "Mainboard",
    description: "Mainboard IPO issues",
  },
  {
    href: "/ipos/sme",
    label: "SME IPOs",
    shortLabel: "SME",
    description: "SME IPO issues",
  },
  {
    href: "/ipo-calendar",
    label: "IPO Calendar",
    shortLabel: "Calendar",
    description: "IPO dates by month",
  },
  {
    href: "/compare",
    label: "Compare",
    shortLabel: "Compare",
    description: "Compare issues",
  },
  {
    href: "/allotment",
    label: "Allotment",
    shortLabel: "Allotment",
    description: "Registrar allotment links",
  },
  {
    href: "/news",
    label: "News",
    shortLabel: "News",
    description: "IPO Singh news and updates",
  },
] as const satisfies readonly SiteRoute[];

export const bottomNav = primaryNav;

export const searchRoute = {
  href: "/search",
  label: "Search",
  shortLabel: "Search",
  description: "Search loaded IPO issues",
} as const satisfies SiteRoute;

export const accountNav = [
  {
    href: "/watchlist",
    label: "Watchlist",
    shortLabel: "Watchlist",
    description: "Saved IPO issues",
  },
  {
    href: "/account",
    label: "Account",
    shortLabel: "Account",
    description: "Sign in or create an account",
  },
] as const satisfies readonly SiteRoute[];

export const footerNav = [
  { href: "/about", label: "About", shortLabel: "About", description: "About IPO Singh" },
  { href: "/contact", label: "Contact", shortLabel: "Contact", description: "Contact IPO Singh" },
  { href: "/privacy", label: "Privacy", shortLabel: "Privacy", description: "Privacy" },
  { href: "/terms", label: "Terms", shortLabel: "Terms", description: "Terms" },
  { href: "/disclaimer", label: "Disclaimer", shortLabel: "Disclaimer", description: "Disclaimer" },
] as const satisfies readonly SiteRoute[];

export const siteRoutes = [searchRoute, ...primaryNav, ...accountNav, ...footerNav] as const;

export function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
