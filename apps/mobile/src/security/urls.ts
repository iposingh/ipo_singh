/**
 * External browser destinations opened from the app. Rejects javascript:,
 * credentials, vendor hosts, and (outside development) plain http.
 */

const vendorHosts = new Set(["ipoguru.in"]);

function isVendorHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return vendorHosts.has(host) || host.endsWith(".ipoguru.in");
}

export function safeExternalHttpsUrl(value: string | null | undefined, allowHttpInDevelopment = false): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  if (url.protocol === "https:") {
    if (isVendorHost(url.hostname)) return null;
    return url.toString();
  }
  if (allowHttpInDevelopment && url.protocol === "http:") {
    if (isVendorHost(url.hostname)) return null;
    return url.toString();
  }
  return null;
}

/** Citation and cover links always require https — never open http or javascript: in production. */
export function safeCitationUrl(value: string | null | undefined): string | null {
  return safeExternalHttpsUrl(value, false);
}
