import { internalServiceHeaders } from "../api/internal-headers.ts";
import { ipoSinghApiOrigin } from "../api/ipo-singh.ts";

const unavailable = JSON.stringify({
  code: "unavailable",
  message: "Administration is temporarily unavailable.",
});

function apiPath(method: string, suffix: string): string | null {
  if (method === "GET" && (suffix === "" || suffix === "session")) return "/api/v1/admin/session";
  if (method === "GET" && suffix === "provider") return "/api/v1/admin/provider";
  if (method === "GET" && suffix === "audit") return "/api/v1/admin/audit";
  if (method === "GET" && suffix === "dashboard") return "/api/v1/admin/dashboard";
  if (method === "GET" && suffix === "ipos") return "/api/v1/admin/ipos";
  if (method === "GET" && suffix === "sync") return "/api/v1/admin/sync";
  if (method === "POST" && suffix === "sync") return "/api/v1/admin/sync";
  if (method === "POST" && suffix === "roles") return "/api/v1/admin/roles";
  if (method === "POST" && suffix === "sessions/revoke") return "/api/v1/admin/sessions/revoke";
  if (method === "GET" && suffix === "banners") return "/api/v1/admin/banners";
  if (method === "POST" && suffix === "banners") return "/api/v1/admin/banners";
  if (method === "POST" && suffix === "banners/reorder") return "/api/v1/admin/banners/reorder";
  const banner = /^banners\/(banner-[a-f0-9]{16})$/.exec(suffix);
  if (banner && (method === "GET" || method === "PATCH" || method === "DELETE")) return `/api/v1/admin/banners/${banner[1]}`;
  const action = /^banners\/(banner-[a-f0-9]{16})\/(activate|deactivate|archive)$/.exec(suffix);
  if (action && method === "POST") return `/api/v1/admin/banners/${action[1]}/${action[2]}`;
  if (method === "GET" && suffix === "allotment-verifications") return "/api/v1/admin/allotment-verifications";
  if (method === "POST" && suffix === "allotment-verifications/confirm") return "/api/v1/admin/allotment-verifications/confirm";
  if (method === "POST" && suffix === "allotment-verifications/retry") return "/api/v1/admin/allotment-verifications/retry";
  return null;
}

export async function proxyAdmin(input: {
  method: string;
  suffix: string;
  search?: string;
  origin?: string;
  cookie: string | null;
  csrf: string | null;
  body: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: string; retryAfterSeconds: number | null }> {
  const path = apiPath(input.method, input.suffix);
  if (!path) {
    return {
      status: 404,
      body: JSON.stringify({ code: "not_found", message: "That page does not exist." }),
      retryAfterSeconds: null,
    };
  }
  const origin = ipoSinghApiOrigin(input.origin);
  if (!origin) return { status: 503, body: unavailable, retryAfterSeconds: null };
  const headers = new Headers(internalServiceHeaders());
  headers.set("accept", "application/json");
  if (input.cookie) headers.set("cookie", input.cookie);
  if (input.csrf) headers.set("x-csrf-token", input.csrf);
  if (input.method !== "GET") headers.set("content-type", "application/json");
  const url = new URL(path, origin);
  if (input.search) url.search = input.search;
  try {
    const response = await (input.fetchImpl ?? fetch)(url, {
      method: input.method,
      headers,
      body: input.method === "GET" ? undefined : (input.body ?? "{}"),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    const retryAfter = response.headers.get("retry-after");
    const body = await response.text();
    return {
      status: response.status,
      body,
      retryAfterSeconds: retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null,
    };
  } catch {
    return { status: 503, body: unavailable, retryAfterSeconds: null };
  }
}
