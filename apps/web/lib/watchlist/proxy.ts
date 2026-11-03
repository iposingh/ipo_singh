import { stableIdSchema } from "@ipo-singh/contracts";
import { ipoSinghApiOrigin } from "../api/ipo-singh.ts";

const unavailable = JSON.stringify({
  code: "unavailable",
  message: "The watchlist is temporarily unavailable.",
});

export async function proxyWatchlist(input: {
  method: string;
  ipoId?: string | null;
  origin?: string;
  cookie: string | null;
  csrf: string | null;
  body: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: string }> {
  if (input.method !== "GET" && input.method !== "POST" && input.method !== "DELETE") {
    return { status: 405, body: JSON.stringify({ code: "validation_error", message: "Request validation failed." }) };
  }
  if ((input.method === "POST" && input.ipoId) || (input.method === "DELETE" && !input.ipoId) || (input.method === "GET" && input.ipoId === "")) {
    return { status: 404, body: JSON.stringify({ code: "not_found", message: "That page does not exist." }) };
  }
  if (input.ipoId) {
    const parsed = stableIdSchema.safeParse(input.ipoId);
    if (!parsed.success) return { status: 400, body: JSON.stringify({ code: "validation_error", message: "Request validation failed." }) };
  }
  const origin = ipoSinghApiOrigin(input.origin);
  if (!origin) return { status: 503, body: unavailable };

  const headers = new Headers();
  headers.set("accept", "application/json");
  if (input.cookie) headers.set("cookie", input.cookie);
  if (input.csrf) headers.set("x-csrf-token", input.csrf);
  if (input.method === "POST") headers.set("content-type", "application/json");
  const path = input.ipoId ? `/api/v1/watchlist/${input.ipoId}` : "/api/v1/watchlist";
  const response = await (input.fetchImpl ?? fetch)(new URL(path, origin), {
    method: input.method,
    headers,
    body: input.method === "POST" ? (input.body ?? "{}") : undefined,
    cache: "no-store",
    redirect: "manual",
  });
  return { status: response.status, body: input.method === "DELETE" && response.status === 204 ? "" : await response.text() };
}
