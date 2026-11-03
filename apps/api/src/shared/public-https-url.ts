import { isIP } from "node:net";

const blockedExactHosts = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "instance-data",
]);

/** Reject loopback, link-local, private, and other non-public address forms. */
export function isBlockedNetworkHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (blockedExactHosts.has(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (host === "ipoguru.in" || host.endsWith(".ipoguru.in")) return true;

  const ipVersion = isIP(host);
  if (ipVersion === 4) return !isPublicIpv4(host);
  if (ipVersion === 6) return !isPublicIpv6(host);

  // Hostnames must look like a DNS name (no bare single labels used as SSRF pivots).
  if (!host.includes(".")) return true;
  return false;
}

function isPublicIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a = 0, b = 0] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
  if (normalized.startsWith("fe80")) return false;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isPublicIpv4(mapped);
  }
  return true;
}

/** Parse an absolute https URL that is safe for server-side fetches and sponsored links. */
export function parsePublicHttpsUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 2_048) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (isBlockedNetworkHostname(url.hostname)) return null;
  return url;
}
