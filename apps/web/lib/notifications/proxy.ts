import { ipoSinghApiOrigin } from "../api/ipo-singh.ts";

const unavailable = JSON.stringify({
  code: "unavailable",
  message: "Notifications are temporarily unavailable.",
});

const readPath = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/read$/;

function apiPath(method: string, suffix: string): string | null {
  if (method === "GET" && suffix === "") return "/api/v1/notifications";
  if (method === "GET" && suffix === "unread-count") return "/api/v1/notifications/unread-count";
  if (method === "POST" && suffix === "read-all") return "/api/v1/notifications/read-all";
  if (method === "PATCH" && suffix === "preferences") return "/api/v1/notifications/preferences";
  if (method === "POST" && readPath.test(suffix)) return `/api/v1/notifications/${suffix}`;
  return null;
}

export async function proxyNotifications(input: {
  method: string;
  suffix: string;
  search?: string;
  origin?: string;
  cookie: string | null;
  csrf: string | null;
  body: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: string }> {
  const path = apiPath(input.method, input.suffix);
  if (!path) return { status: 404, body: JSON.stringify({ code: "not_found", message: "That page does not exist." }) };
  const origin = ipoSinghApiOrigin(input.origin);
  if (!origin) return { status: 503, body: unavailable };
  const headers = new Headers();
  headers.set("accept", "application/json");
  if (input.cookie) headers.set("cookie", input.cookie);
  if (input.csrf) headers.set("x-csrf-token", input.csrf);
  if (input.method !== "GET") headers.set("content-type", "application/json");
  const url = new URL(path, origin);
  if (input.search) url.search = input.search;
  const response = await (input.fetchImpl ?? fetch)(url, {
    method: input.method,
    headers,
    body: input.method === "GET" ? undefined : (input.body ?? "{}"),
    cache: "no-store",
    redirect: "manual",
  });
  return { status: response.status, body: await response.text() };
}
