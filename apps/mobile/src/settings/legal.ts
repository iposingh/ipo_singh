import { readAppEnvironment, type AppEnvironment } from "../api/origin.ts";

/** Public contact for the developer. The app does not send email itself. */
export const developerContactEmail = "iposingh.dev@gmail.com";

export const developerMailto = `mailto:${developerContactEmail}`;

export type LegalPageId = "privacy" | "terms" | "about" | "contact";

export const legalPages: readonly {
  id: LegalPageId;
  label: string;
  path: `/${LegalPageId}`;
  /** Summary aligned with the website page. Do not invent policy text. */
  summary: string;
}[] = [
  {
    id: "privacy",
    label: "Privacy Policy",
    path: "/privacy",
    summary:
      "An account is optional. IPO pages can be read without signing in. The app reads the stored catalogue from the IPO Singh API and does not collect PAN or application numbers. You can close an account from Settings with your password. Email and SMS are not sent.",
  },
  {
    id: "terms",
    label: "Terms & Conditions",
    path: "/terms",
    summary:
      "Browsing IPO pages does not require an account. Creating an account is optional. Stored figures are shown as published; a missing figure is not shown as zero. Paid features are not open.",
  },
  {
    id: "about",
    label: "About IPO Singh",
    path: "/about",
    summary:
      "IPO Singh is a place for stored Indian IPO listings, calendars, and individual issue pages. Mainboard and SME lists stay empty when nothing is stored. GMP on a detail page is unofficial and indicative.",
  },
  {
    id: "contact",
    label: "Contact Developer",
    path: "/contact",
    summary: `Contact the IPO Singh developer at ${developerContactEmail}. The app opens your mail app; it does not send messages itself.`,
  },
] as const;

function siteOrigin(site: string | undefined, appEnv: AppEnvironment): string | null {
  const raw = site?.trim() ?? "";
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username !== "" || url.password !== "") return null;
  if (url.search !== "" || url.hash !== "" || (url.pathname !== "/" && url.pathname !== "")) return null;
  const host = url.hostname.toLowerCase();
  if (host === "ipoguru.in" || host.endsWith(".ipoguru.in")) return null;
  const local = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".localhost");
  if (appEnv !== "development" && (local || url.protocol !== "https:")) return null;
  return url.origin;
}

/** Opens the matching website legal page when the public site origin is configured. */
export function legalPageUrl(
  id: LegalPageId,
  site = process.env.EXPO_PUBLIC_IPO_SINGH_SITE_URL,
  appEnv = readAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV, __DEV__),
): string | null {
  const page = legalPages.find((item) => item.id === id);
  if (!page) return null;
  const origin = siteOrigin(site, appEnv);
  if (!origin) return null;
  return new URL(page.path, origin).href;
}

export function appVersionLabel(version: string | null | undefined, build?: string | null): string {
  const trimmed = version?.trim() || "0.1.0";
  if (build && build.trim()) return `${trimmed} (${build.trim()})`;
  return trimmed;
}
