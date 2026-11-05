/**
 * Speculative Next.js route prefetch policy for IPO Singh links.
 *
 * Prefetch is NOT data fetching. Disabling it only stops background RSC loads.
 * Actual clicks, direct URLs, refresh, and back/forward still load complete page data
 * under the existing Prompt 91 public catalogue cache.
 */

const informationalExact = new Set([
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/blog",
  "/account",
  "/login",
  "/register",
  "/watchlist",
  "/notifications",
  "/design-system",
  "/ipo-unavailable",
]);

const primaryExact = new Set([
  "/",
  "/ipos/mainboard",
  "/ipos/sme",
  "/ipos/listed",
  "/ipo-calendar",
  "/compare",
  "/allotment",
  "/search",
  "/gmp",
  "/subscription",
]);

/** True when the path is an individual IPO detail address (`/ipos/{slug}`). */
export function isIpoDetailPath(pathname: string): boolean {
  if (!pathname.startsWith("/ipos/")) return false;
  const rest = pathname.slice("/ipos/".length);
  if (!rest || rest.includes("/")) return false;
  return rest !== "mainboard" && rest !== "sme" && rest !== "listed";
}

/**
 * Whether a Link should use automatic speculative prefetch.
 * Returns false for informational pages, account surfaces, IPO detail cards, and main catalogue
 * routes that were observed prefetching repeatedly in production DevTools.
 */
export function shouldPrefetchPath(href: string): boolean {
  let pathname = href;
  try {
    if (href.startsWith("http://") || href.startsWith("https://")) {
      pathname = new URL(href).pathname;
    } else {
      pathname = href.split("?")[0]?.split("#")[0] ?? href;
    }
  } catch {
    return false;
  }
  if (!pathname.startsWith("/")) return false;
  if (informationalExact.has(pathname)) return false;
  if (primaryExact.has(pathname)) return false;
  if (pathname.startsWith("/blog/")) return false;
  if (pathname.startsWith("/admin")) return false;
  if (isIpoDetailPath(pathname)) return false;
  // Unknown internal paths default to no speculative prefetch.
  return false;
}
