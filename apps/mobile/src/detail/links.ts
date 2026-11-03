import { stableIdSchema } from "@ipo-singh/contracts";
import { verifiedAllotmentUrl } from "@ipo-singh/core";
import type { AppEnvironment } from "../api/origin.ts";

function siteOrigin(site: string | undefined, appEnv: AppEnvironment): { origin: string } | { message: string } {
  const raw = site?.trim() ?? "";
  if (!raw) return { message: "The public page address is not set for this build." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { message: "The public website address is not valid." };
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username !== "" || url.password !== "") {
    return { message: "The public website address is not valid." };
  }
  if (url.search !== "" || url.hash !== "" || (url.pathname !== "/" && url.pathname !== "")) {
    return { message: "The public website address is not valid." };
  }
  const host = url.hostname.toLowerCase();
  if (host === "ipoguru.in" || host.endsWith(".ipoguru.in")) return { message: "The app cannot share the data vendor address." };
  const local = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".localhost");
  if (appEnv !== "development" && (local || url.protocol !== "https:")) {
    return { message: "This build needs the public IPO Singh website address." };
  }
  return { origin: url.origin };
}

/** Stable public website page. This is not an API or vendor address. */
export function publicIpoPage(site: string | undefined, slug: string, appEnv: AppEnvironment): { url: string } | { url: null; message: string } {
  if (!stableIdSchema.safeParse(slug).success) return { url: null, message: "This IPO address is not valid." };
  const origin = siteOrigin(site, appEnv);
  if ("message" in origin) return { url: null, message: origin.message };
  return { url: new URL(`/ipos/${slug}`, origin.origin).href };
}

/** http(s) document address with no credentials. Other schemes are rejected. */
export function documentLink(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
  return url.toString();
}

/** Verified registrar allotment page. A registrar home page is not accepted. */
export function allotmentLink(input: { name?: string | null; allotmentUrl?: string | null } | null): string | null {
  if (!input) return null;
  return verifiedAllotmentUrl({ name: input.name, statusPage: documentLink(input.allotmentUrl) });
}
