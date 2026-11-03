import { registrarPortalForName } from "./registrar-directory.ts";

/**
 * Official allotment hosts for KFin Technologies, MUFG Intime India, and Bigshare Services.
 * Prefer a vendor `status_page` when that exact URL is http(s), has no credentials, and its host and path match.
 * When the provider omits a valid status page, a verified general portal from the registrar directory may be used
 * only if the registrar identity matches uniquely. IPO-specific URLs are never guessed.
 */

type HttpUrl = {
  protocol: string;
  hostname: string;
  pathname: string;
  username: string;
  password: string;
  toString(): string;
};

const registrars: readonly { accept(url: HttpUrl): boolean }[] = [
  {
    accept(url) {
      const host = url.hostname.toLowerCase();
      if (host === "ipostatus.kfintech.com") return true;
      return host === "ris.kfintech.com" && url.pathname.toLowerCase().startsWith("/ipostatus");
    },
  },
  {
    accept(url) {
      return url.hostname.toLowerCase() === "in.mpms.mufg.com" && url.pathname.toLowerCase().startsWith("/initial_offer");
    },
  },
  {
    accept(url) {
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();
      const officialHost = host === "ipo.bigshareonline.com" || host === "ipo1.bigshareonline.com" || host === "ipo2.bigshareonline.com";
      if (officialHost && path === "/ipo_status.html") return true;
      if ((host === "www.bigshareonline.com" || host === "bigshareonline.com") && path === "/ipo_allotment_status.aspx") return true;
      // Alternate registrar-controlled allotment landing page named in product requirements.
      return (host === "www.bigshareonline.com" || host === "bigshareonline.com") && path === "/ipo_allotment.html";
    },
  },
];

function acceptedOfficial(url: HttpUrl | null): string | null {
  if (!url || !registrars.some((registrar) => registrar.accept(url))) return null;
  return url.toString();
}

export function verifiedAllotmentUrl(input: {
  name?: string | null;
  slug?: string | null;
  statusPage?: string | null;
}): string | null {
  const supplied = acceptedOfficial(safeHttp(input.statusPage));
  if (supplied) return supplied;
  const directory =
    registrarPortalForName(input.name) ?? registrarPortalForName((input.slug ?? "").replace(/-/g, " "));
  return acceptedOfficial(safeHttp(directory));
}

function safeHttp(value: string | null | undefined): HttpUrl | null {
  if (!value) return null;
  const Parser = (globalThis as { URL?: new (input: string) => HttpUrl }).URL;
  if (!Parser) return null;
  let url: HttpUrl;
  try {
    url = new Parser(value);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
  return url;
}
