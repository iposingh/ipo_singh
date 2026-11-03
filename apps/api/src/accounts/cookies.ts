import { authCookieNames, authCsrfHeader } from "@ipo-singh/contracts";

export type SessionCookieValues = {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessMaxAgeSeconds: number;
  refreshMaxAgeSeconds: number;
};

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function serialize(name: string, value: string, attributes: readonly string[]): string {
  return [`${name}=${encodeURIComponent(value)}`, ...attributes].join("; ");
}

/** Website session cookies. The access and refresh cookies are not readable by script. */
export function sessionCookieHeaders(values: SessionCookieValues, secure: boolean): string[] {
  const secureFlag = secure ? ["Secure"] : [];
  return [
    serialize(authCookieNames.access, values.accessToken, [
      "HttpOnly",
      "SameSite=Lax",
      "Path=/",
      `Max-Age=${values.accessMaxAgeSeconds}`,
      ...secureFlag,
    ]),
    serialize(authCookieNames.refresh, values.refreshToken, [
      "HttpOnly",
      "SameSite=Strict",
      "Path=/api/v1/auth",
      `Max-Age=${values.refreshMaxAgeSeconds}`,
      ...secureFlag,
    ]),
    serialize(authCookieNames.csrf, values.csrfToken, [
      "SameSite=Lax",
      "Path=/",
      `Max-Age=${values.accessMaxAgeSeconds}`,
      ...secureFlag,
    ]),
  ];
}

export function clearSessionCookieHeaders(secure: boolean): string[] {
  return sessionCookieHeaders(
    { accessToken: "", refreshToken: "", csrfToken: "", accessMaxAgeSeconds: 0, refreshMaxAgeSeconds: 0 },
    secure,
  );
}

export function readCsrfHeader(value: string | undefined): string | null {
  const token = value?.trim() ?? "";
  return token ? token : null;
}

export { authCsrfHeader };
