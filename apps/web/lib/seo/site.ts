function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".localhost");
}

function isEphemeralSiteHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.endsWith(".trycloudflare.com") ||
    host.endsWith(".cfargotunnel.com") ||
    host.endsWith(".loca.lt") ||
    host.endsWith(".ngrok.io") ||
    host.endsWith(".ngrok-free.app") ||
    host.endsWith(".ngrok.app") ||
    host.endsWith(".serveo.net")
  );
}

/** Public origin for canonical URLs, the sitemap, and structured data. Unset until deployment. */
export function siteUrl(value = process.env.IPO_SINGH_SITE_URL, nodeEnv = process.env.NODE_ENV): URL | null {
  const raw = value?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  const host = url.hostname.toLowerCase();
  if (host === "ipoguru.in" || host.endsWith(".ipoguru.in")) return null;
  if (nodeEnv === "production") {
    if (url.protocol !== "https:") return null;
    if (isLoopbackHost(host) || isEphemeralSiteHost(host)) return null;
  }
  return new URL(`${url.protocol}//${url.host}/`);
}

/** Pages worth one sitemap entry. Query variants and empty search URLs are omitted. */
export const indexablePaths = [
  { path: "/", label: "Home" },
  { path: "/ipos/mainboard", label: "Mainboard IPOs" },
  { path: "/ipos/sme", label: "SME IPOs" },
  { path: "/ipo-calendar", label: "IPO Calendar" },
  { path: "/ipos/listed", label: "Listed IPOs" },
  { path: "/compare", label: "Compare IPOs" },
  { path: "/allotment", label: "Allotment" },
  { path: "/news", label: "News" },
  { path: "/about", label: "About" },
  { path: "/contact", label: "Contact" },
  { path: "/privacy", label: "Privacy" },
  { path: "/terms", label: "Terms" },
  { path: "/disclaimer", label: "Disclaimer" },
] as const;

/** Internal, placeholder, and search URLs. robots.txt disallows these. */
export const privateRobotsPaths = [
  "/search",
  "/account",
  "/login",
  "/register",
  "/watchlist",
  "/notifications",
  "/admin",
  "/design-system",
  "/gmp",
  "/subscription",
  "/ipo-unavailable",
  "/api/",
] as const;
