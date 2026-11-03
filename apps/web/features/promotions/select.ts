import { parseAdSlides, type AdSlide } from "./ads.ts";

export type RemotePromotions = {
  managed: boolean;
  slides: unknown;
};

/** Managed banners replace the house slides. An empty managed list hides the carousel. A failed read keeps the house slides. */
export function choosePromotionSlides(remote: RemotePromotions | null, house: readonly AdSlide[]): readonly AdSlide[] {
  if (!remote || !remote.managed) return house;
  if (!Array.isArray(remote.slides) || remote.slides.length === 0) return [];
  const publicSlides = remote.slides.filter((slide) => {
    if (!slide || typeof slide !== "object") return false;
    const image = (slide as { image?: { desktop?: { src?: unknown }; mobile?: { src?: unknown } } }).image;
    const desktop = image?.desktop?.src;
    const mobile = image?.mobile?.src;
    return typeof desktop === "string" && typeof mobile === "string" && !desktop.includes("/api/admin/") && !mobile.includes("/api/admin/");
  });
  return parseAdSlides(publicSlides) ?? house;
}
