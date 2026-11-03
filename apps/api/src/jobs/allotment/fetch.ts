/**
 * Bounded HTTPS fetch for official registrar pages.
 * Uses the platform TLS trust store. Certificate validation is never disabled.
 * Redirects are followed only onto other public https hosts (no private/link-local targets).
 */

import { parsePublicHttpsUrl } from "../../shared/public-https-url.ts";

export type RegistrarFetchResult = {
  ok: boolean;
  status: number;
  url: string;
  body: string;
  contentType: string | null;
};

const maxRedirects = 3;

export async function fetchRegistrarText(input: {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<RegistrarFetchResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const method = input.method ?? "GET";
  let current = parsePublicHttpsUrl(input.url);
  if (!current) {
    throw new Error("Registrar URL must be a public https address.");
  }

  let response: Response | null = null;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    response = await fetchImpl(current.href, {
      method: hop === 0 ? method : "GET",
      redirect: "manual",
      headers: {
        // Browser-compatible UA: some registrar CDNs serve SPA shells to unknown agents.
        // This does not disable TLS, CAPTCHA, or authentication.
        "user-agent":
          "Mozilla/5.0 (compatible; IPOSinghAllotmentVerify/0.2; +https://iposingh.local) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "x-ipo-singh-purpose": "allotment-company-list-readonly",
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        ...(hop === 0 ? input.headers : {}),
      },
      body: hop === 0 ? input.body : undefined,
      signal: AbortSignal.timeout(input.timeoutMs ?? 15_000),
    });

    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location || hop === maxRedirects) break;
    const next = parsePublicHttpsUrl(new URL(location, current).href);
    if (!next) {
      throw new Error("Registrar redirect targeted a blocked host.");
    }
    current = next;
  }

  if (!response) throw new Error("Registrar fetch did not complete.");

  // Prefer bytes→utf8 so CDNs that mis-label content-type still yield the JS/HTML body.
  const body = Buffer.from(await response.arrayBuffer()).toString("utf8");
  return {
    ok: response.ok,
    status: response.status,
    url: response.url || current.href,
    body,
    contentType: response.headers.get("content-type"),
  };
}
