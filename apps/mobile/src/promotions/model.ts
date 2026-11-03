import { stableIdSchema, type PublicPromotionResponse } from "@ipo-singh/contracts";
import type { AppEnvironment } from "../api/origin.ts";

export const promotionAutoplayMs = 7_000;
export const promotionImageCachePolicy = "memory-disk" as const;
export const promotionMaxHeight = 240;
const promotionImageWidth = 780;
const promotionImageHeight = 520;

const internalPattern = /^\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/;
const mediaPattern = /^\/api\/promotions\/media\/(image-[a-f0-9]{16})$/;
const storeHosts = new Set(["play.google.com", "apps.apple.com", "itunes.apple.com"]);

export type PromotionRoute =
  | "/"
  | "/(tabs)/ipos"
  | "/(tabs)/sme"
  | "/(tabs)/calendar"
  | "/(tabs)/watchlist"
  | "/(tabs)/settings"
  | "/(tabs)/account"
  | "/compare"
  | "/(tabs)/notifications"
  | "/notifications";

export type PromotionDestination =
  | { kind: "route"; href: PromotionRoute }
  | { kind: "ipo"; slug: string }
  | { kind: "website"; url: string }
  | { kind: "external"; url: string };

export type PromotionImage =
  | { kind: "brand"; tone: "mainboard" | "sme" | "calendar"; alt: string }
  | { kind: "remote"; url: string; alt: string; width: number; height: number };

export type MobileBanner = {
  id: string;
  title: string;
  description: string;
  disclosure: "advertisement" | "sponsored" | null;
  label: "IPO Singh" | "Advertisement" | "Sponsored";
  destination: PromotionDestination;
  image: PromotionImage;
};

export function promotionLabel(disclosure: MobileBanner["disclosure"]): MobileBanner["label"] {
  if (disclosure === "advertisement") return "Advertisement";
  if (disclosure === "sponsored") return "Sponsored";
  return "IPO Singh";
}

export function promotionAccessibilityLabel(banner: MobileBanner, index: number, count: number): string {
  return `${banner.label}. ${banner.title}. ${banner.description}. Promotion ${index + 1} of ${count}.`;
}

/** Content width is the space inside the page padding. Height stays capped so the card is not a full-screen ad. */
export function bannerFrame(contentWidth: number): { width: number; height: number } {
  const width = Math.max(0, Math.floor(contentWidth));
  const natural = Math.round((width * promotionImageHeight) / promotionImageWidth);
  return { width, height: Math.min(promotionMaxHeight, natural) };
}

export function nextSlideIndex(current: number, count: number, step: number): number {
  if (count <= 0) return 0;
  const wrapped = (current + step) % count;
  return wrapped < 0 ? wrapped + count : wrapped;
}

export function autoplayAllowed(input: {
  count: number;
  paused: boolean;
  reducedMotion: boolean;
  interacting: boolean;
  focused: boolean;
  appActive: boolean;
}): boolean {
  return input.count > 1 && !input.paused && !input.reducedMotion && !input.interacting && !input.focused && input.appActive;
}

export function houseBanners(): MobileBanner[] {
  return [
    houseBanner(
      "mainboard",
      "Mainboard IPOs",
      "Browse stored Mainboard issues. The list stays empty when none are stored.",
      { kind: "route", href: "/" },
      "Green banner with three rising bars and an upward arrow",
    ),
    houseBanner(
      "sme",
      "SME IPOs",
      "SME issues stay on their own list, separate from Mainboard.",
      { kind: "route", href: "/(tabs)/sme" },
      "Deep green banner with three rising bars and an upward arrow",
    ),
    houseBanner(
      "calendar",
      "IPO Calendar",
      "Opening, closing, allotment and listing dates in India Standard Time.",
      { kind: "route", href: "/(tabs)/calendar" },
      "Green banner with a calendar graphic",
    ),
  ];
}

function houseBanner(tone: "mainboard" | "sme" | "calendar", title: string, description: string, destination: PromotionDestination, alt: string): MobileBanner {
  return {
    id: tone,
    title,
    description,
    disclosure: null,
    label: "IPO Singh",
    destination,
    image: { kind: "brand", tone, alt },
  };
}

/**
 * The API already applies placement, schedule, and priority. This keeps that order.
 * An unmanaged response, or a managed catalogue with no currently active slides,
 * uses IPO Singh house banners so the home carousel is never blank without reason.
 * Managed slides that fail client safety checks stay hidden rather than falling back.
 */
export function bannersFromResponse(
  response: PublicPromotionResponse | null,
  input: { origin: string; site?: string; appEnv: AppEnvironment },
): MobileBanner[] {
  if (!response || !response.managed || response.slides.length === 0) return houseBanners();
  const banners: MobileBanner[] = [];
  for (const slide of response.slides) {
    const banner = mapSlide(slide, input);
    if (banner) banners.push(banner);
  }
  return banners;
}

function mapSlide(slide: PublicPromotionResponse["slides"][number], input: { origin: string; site?: string; appEnv: AppEnvironment }): MobileBanner | null {
  if (isAppDownloadDestination(slide.href)) return null;
  const destination = promotionDestination(slide.href, slide.disclosure, input.site, input.appEnv);
  if (!destination) return null;
  const url = promotionImageUrl(input.origin, slide.image.mobile.src);
  if (!url) return null;
  return {
    id: slide.id,
    title: slide.title,
    description: slide.description,
    disclosure: slide.disclosure,
    label: promotionLabel(slide.disclosure),
    destination,
    image: { kind: "remote", url, alt: slide.image.alt, width: slide.image.mobile.width, height: slide.image.mobile.height },
  };
}

export function isAppDownloadDestination(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.startsWith("/")) {
    const path = trimmed.split(/[?#]/)[0] ?? trimmed;
    return path === "/app" || path.startsWith("/app/") || path === "/download" || path.startsWith("/download/") || path.includes("ipo-singh-app");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return storeHosts.has(host);
}

/** Public media ids are rewritten onto the API. Website files, admin paths, and vendor hosts are refused. */
export function promotionImageUrl(origin: string, src: string): string | null {
  const match = mediaPattern.exec(src);
  const imageId = match?.[1];
  if (!imageId) return null;
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return null;
  }
  if ((base.protocol !== "http:" && base.protocol !== "https:") || base.username !== "" || base.password !== "") return null;
  const host = base.hostname.toLowerCase();
  if (host === "ipoguru.in" || host.endsWith(".ipoguru.in")) return null;
  const image = new URL(`/api/v1/promotions/media/${imageId}`, base);
  if (image.origin !== base.origin) return null;
  return image.href;
}

export function promotionDestination(href: string, disclosure: MobileBanner["disclosure"], site: string | undefined, appEnv: AppEnvironment): PromotionDestination | null {
  const trimmed = href.trim();
  if (trimmed.length === 0 || trimmed.length > 500 || isAppDownloadDestination(trimmed)) return null;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    if (disclosure !== "advertisement" && disclosure !== "sponsored") return null;
    return externalDestination(trimmed);
  }
  return internalDestination(trimmed, site, appEnv);
}

function externalDestination(href: string): PromotionDestination | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
  const host = url.hostname.toLowerCase();
  if (host === "ipoguru.in" || host.endsWith(".ipoguru.in")) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return null;
  if (isAppDownloadDestination(url.href)) return null;
  return { kind: "external", url: url.href };
}

function internalDestination(href: string, site: string | undefined, appEnv: AppEnvironment): PromotionDestination | null {
  if (href !== "/" && !internalPattern.test(href)) return null;
  if (href === "/" || href === "/ipos" || href === "/ipos/mainboard") return { kind: "route", href: "/" };
  if (href === "/ipos/sme") return { kind: "route", href: "/(tabs)/sme" };
  if (href === "/search") return { kind: "route", href: "/(tabs)/ipos" };
  if (href === "/ipo-calendar" || href === "/calendar") return { kind: "route", href: "/(tabs)/calendar" };
  if (href === "/compare") return { kind: "route", href: "/compare" };
  if (href === "/watchlist") return { kind: "route", href: "/(tabs)/watchlist" };
  if (href === "/account" || href === "/settings") return { kind: "route", href: "/(tabs)/settings" };
  if (href === "/notifications") return { kind: "route", href: "/(tabs)/notifications" };
  const issue = /^\/ipos\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(href);
  const slug = issue?.[1];
  if (slug && stableIdSchema.safeParse(slug).success) return { kind: "ipo", slug };
  const origin = publicSiteOrigin(site, appEnv);
  if (!origin) return null;
  return { kind: "website", url: new URL(href, origin).href };
}

function publicSiteOrigin(site: string | undefined, appEnv: AppEnvironment): string | null {
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
