export type AdDisclosure = "advertisement" | "sponsored";

export type AdImage = {
  src: string;
  width: number;
  height: number;
};

export type AdSlide = {
  id: string;
  title: string;
  description: string;
  href: string;
  disclosure: AdDisclosure | null;
  image: {
    alt: string;
    desktop: AdImage;
    mobile: AdImage;
  };
};

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const internalPattern = /^\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/;

export function disclosureLabel(disclosure: AdDisclosure | null): "Advertisement" | "Sponsored" | null {
  if (disclosure === "advertisement") return "Advertisement";
  if (disclosure === "sponsored") return "Sponsored";
  return null;
}

/** House slides stay on this site. A paid slide must name itself and use https. */
export function parseAdSlides(value: unknown): AdSlide[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null;
  const slides: AdSlide[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const slide = parseSlide(item);
    if (!slide || seen.has(slide.id)) return null;
    seen.add(slide.id);
    slides.push(slide);
  }
  return slides;
}

function parseSlide(value: unknown): AdSlide | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !idPattern.test(record.id)) return null;
  if (typeof record.title !== "string" || record.title.trim().length < 2 || record.title.trim().length > 80) return null;
  if (typeof record.description !== "string" || record.description.trim().length < 8 || record.description.trim().length > 180) return null;
  if (typeof record.href !== "string" || !promotionHref(record.href, record.disclosure)) return null;
  const disclosure = record.disclosure === null || record.disclosure === "advertisement" || record.disclosure === "sponsored" ? record.disclosure : undefined;
  if (disclosure === undefined) return null;
  const image = parseImage(record.image);
  if (!image) return null;
  return {
    id: record.id,
    title: record.title.trim(),
    description: record.description.trim(),
    href: record.href,
    disclosure,
    image,
  };
}

function promotionHref(href: string, disclosure: unknown): boolean {
  const external = href.startsWith("https://");
  if (external) {
    if (disclosure !== "advertisement" && disclosure !== "sponsored") return false;
    try {
      const url = new URL(href);
      if (url.username !== "" || url.password !== "" || url.protocol !== "https:") return false;
      const host = url.hostname.toLowerCase();
      if (host === "ipoguru.in" || host.endsWith(".ipoguru.in")) return false;
      return true;
    } catch {
      return false;
    }
  }
  return disclosure === null && internalPattern.test(href);
}

function parseImage(value: unknown): AdSlide["image"] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.alt !== "string" || record.alt.trim().length < 2 || record.alt.trim().length > 120) return null;
  const desktop = parseSize(record.desktop);
  const mobile = parseSize(record.mobile);
  if (!desktop || !mobile) return null;
  return { alt: record.alt.trim(), desktop, mobile };
}

function promotionImageSrc(src: string): boolean {
  if (src.includes("..") || src.includes("\\")) return false;
  return /^\/(?:promotions\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:svg|png|jpe?g|webp)|api\/promotions\/media\/image-[a-f0-9]{16}|api\/admin\/banners\/media\/image-[a-f0-9]{16})$/.test(src);
}

function parseSize(value: unknown): AdImage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.src !== "string" || !promotionImageSrc(record.src)) return null;
  if (typeof record.width !== "number" || typeof record.height !== "number") return null;
  if (!Number.isInteger(record.width) || !Number.isInteger(record.height) || record.width < 1 || record.height < 1) return null;
  return { src: record.src, width: record.width, height: record.height };
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
  pointerPaused: boolean;
  focusPaused: boolean;
  pageHidden: boolean;
}): boolean {
  return input.count > 1 && !input.paused && !input.reducedMotion && !input.pointerPaused && !input.focusPaused && !input.pageHidden;
}
