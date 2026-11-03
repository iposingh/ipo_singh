import { stableIdSchema } from "@ipo-singh/contracts";

export function issueRoute(slug: string): { pathname: "/ipo/[slug]"; params: { slug: string } } | null {
  if (!stableIdSchema.safeParse(slug).success) return null;
  return { pathname: "/ipo/[slug]", params: { slug } };
}

/** Href form used by Expo Router. Invalid slugs return null so cards do not navigate. */
export function issueHref(slug: string): `/ipo/${string}` | null {
  const route = issueRoute(slug);
  if (!route) return null;
  return `/ipo/${route.params.slug}`;
}

export function issueRequestPath(slug: string): string | null {
  if (!stableIdSchema.safeParse(slug).success) return null;
  return `/api/v1/ipos/${slug}`;
}

export function gmpHistoryRequestPath(slug: string): string | null {
  const issue = issueRequestPath(slug);
  return issue ? `${issue}/gmp/history` : null;
}

export function subscriptionHistoryRequestPath(slug: string): string | null {
  const issue = issueRequestPath(slug);
  return issue ? `${issue}/subscription/history` : null;
}
