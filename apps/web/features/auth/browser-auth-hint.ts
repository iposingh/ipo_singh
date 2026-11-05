import { readCsrfToken } from "./csrf.ts";

/**
 * Browser-visible hint that an auth session may exist.
 * Only the CSRF cookie is readable from script; access/refresh are HttpOnly.
 * Existing refresh flows already require CSRF, so skipping authenticated probes
 * when CSRF is absent matches current restore capability and avoids guest 401s.
 */
export function hasBrowserAuthHint(cookieHeader: string | null | undefined = typeof document !== "undefined" ? document.cookie : null): boolean {
  return readCsrfToken(cookieHeader) !== null;
}
