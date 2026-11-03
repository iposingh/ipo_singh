import { parsePublicHttpsUrl } from "../shared/public-https-url.ts";

const internalPattern = /^\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/;

/** House banners stay on this site. A sponsored banner may use https, never a private or vendor host. */
export function bannerDestination(value: string, sponsored: boolean): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return null;
  if (trimmed.startsWith("/")) {
    return internalPattern.test(trimmed) ? trimmed : null;
  }
  if (!sponsored) return null;
  const url = parsePublicHttpsUrl(trimmed);
  return url ? url.href : null;
}
