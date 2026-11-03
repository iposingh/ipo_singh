import { ipoSinghApiOrigin } from "../api/ipo-singh.ts";

const methods = {
  register: "POST",
  login: "POST",
  logout: "POST",
  "logout-all": "POST",
  refresh: "POST",
  session: "GET",
  profile: "PATCH",
  preferences: "PATCH",
  password: "POST",
  "revoke-session": "POST",
  "delete-account": "POST",
} as const;

export type AuthAction = keyof typeof methods;

const paths: Record<AuthAction, string> = {
  register: "/api/v1/auth/register",
  login: "/api/v1/auth/login",
  logout: "/api/v1/auth/logout",
  "logout-all": "/api/v1/auth/logout-all",
  refresh: "/api/v1/auth/refresh",
  session: "/api/v1/auth/session",
  profile: "/api/v1/auth/profile",
  preferences: "/api/v1/auth/preferences",
  password: "/api/v1/auth/password",
  "revoke-session": "/api/v1/auth/sessions/revoke",
  "delete-account": "/api/v1/auth/account/delete",
};

const unavailable = JSON.stringify({
  code: "unavailable",
  message: "Sign-in is temporarily unavailable.",
});

/** The API scopes the refresh cookie to its own auth path. The website proxy uses /api/auth. */
export function rewriteAuthSetCookie(header: string): string {
  return header.replace(/Path=\/api\/v1\/auth/g, "Path=/api/auth");
}

export async function proxyAuth(input: {
  action: string;
  method: string;
  origin?: string;
  cookie: string | null;
  csrf: string | null;
  body: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: string; cookies: string[] }> {
  const method = methods[input.action as AuthAction];
  if (!method) {
    return { status: 404, body: JSON.stringify({ code: "not_found", message: "That page does not exist." }), cookies: [] };
  }
  if (input.method !== method) {
    return { status: 405, body: JSON.stringify({ code: "validation_error", message: "Request validation failed." }), cookies: [] };
  }
  const origin = ipoSinghApiOrigin(input.origin);
  if (!origin) return { status: 503, body: unavailable, cookies: [] };

  const headers = new Headers();
  headers.set("accept", "application/json");
  if (input.cookie) headers.set("cookie", input.cookie);
  if (input.csrf) headers.set("x-csrf-token", input.csrf);
  if (method !== "GET") headers.set("content-type", "application/json");

  const response = await (input.fetchImpl ?? fetch)(new URL(paths[input.action as AuthAction], origin), {
    method,
    headers,
    body: method === "GET" ? undefined : (input.body ?? "{}"),
    cache: "no-store",
    redirect: "manual",
  });
  const cookies = (typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []).map(rewriteAuthSetCookie);
  return { status: response.status, body: await response.text(), cookies };
}
