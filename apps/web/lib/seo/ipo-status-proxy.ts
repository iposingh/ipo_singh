const reservedIpoSegments = new Set(["mainboard", "sme", "listed"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type IpoProxyDecision =
  | { action: "next" }
  | { action: "missing" }
  | { action: "check-api"; slug: string };

/** Decide whether an `/ipos/...` path is a board browse route, an invalid slug, or needs an API existence check. */
export function decideIpoProxyPath(pathname: string): IpoProxyDecision {
  const match = pathname.match(/^\/ipos\/([^/]+)\/?$/);
  if (!match) return { action: "next" };
  const slug = match[1] ?? "";
  if (reservedIpoSegments.has(slug)) return { action: "next" };
  if (!slugPattern.test(slug) || slug.length > 80) return { action: "missing" };
  return { action: "check-api", slug };
}

/** Call the IPO Singh API only to learn whether a slug is stored. Outages stay non-404. */
export async function apiReportsMissingIpo(
  slug: string,
  origin: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const trimmed = origin?.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(`/api/v1/ipos/${encodeURIComponent(slug)}`, trimmed);
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    });
    return response.status === 404;
  } catch {
    return false;
  }
}
