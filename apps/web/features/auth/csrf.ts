import { authCookieNames } from "@ipo-singh/contracts";

/** Reads only the CSRF cookie. Access and refresh cookies are HttpOnly and are not parsed for script. */
export function readCsrfToken(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== authCookieNames.csrf) continue;
    try {
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      return value || null;
    } catch {
      return null;
    }
  }
  return null;
}
