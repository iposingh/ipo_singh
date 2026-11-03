import type { AdminBanner, PublicPromotionResponse } from "@ipo-singh/contracts";
import type { BannerImageRecord, BannerRecord } from "./records.ts";

export function bannerIsVisible(banner: BannerRecord, now: Date): boolean {
  if (banner.status !== "active" || banner.placement !== "home") return false;
  if (!banner.desktopImageId || !banner.mobileImageId) return false;
  if (banner.startAt && banner.startAt.getTime() > now.getTime()) return false;
  if (banner.endAt && banner.endAt.getTime() <= now.getTime()) return false;
  return true;
}

export function orderedBanners(banners: readonly BannerRecord[]): BannerRecord[] {
  return [...banners].sort((left, right) => right.priority - left.priority || left.sortOrder - right.sortOrder || left.createdAt.getTime() - right.createdAt.getTime());
}

export function toPublicSlides(input: {
  banners: readonly BannerRecord[];
  images: ReadonlyMap<string, BannerImageRecord>;
  now: Date;
}): PublicPromotionResponse["slides"] {
  const slides: PublicPromotionResponse["slides"] = [];
  for (const banner of orderedBanners(input.banners)) {
    if (!bannerIsVisible(banner, input.now)) continue;
    const desktop = banner.desktopImageId ? input.images.get(banner.desktopImageId) : undefined;
    const mobile = banner.mobileImageId ? input.images.get(banner.mobileImageId) : undefined;
    if (!desktop || !mobile) continue;
    slides.push({
      id: banner.id,
      title: banner.title,
      description: banner.description,
      href: banner.destinationUrl,
      disclosure: banner.disclosure,
      image: {
        alt: banner.title,
        desktop: { src: `/api/promotions/media/${desktop.id}`, width: desktop.width, height: desktop.height },
        mobile: { src: `/api/promotions/media/${mobile.id}`, width: mobile.width, height: mobile.height },
      },
    });
    if (slides.length === 8) break;
  }
  return slides;
}

export function toAdminBanner(banner: BannerRecord, images: ReadonlyMap<string, BannerImageRecord>): AdminBanner {
  const desktop = banner.desktopImageId ? images.get(banner.desktopImageId) : undefined;
  const mobile = banner.mobileImageId ? images.get(banner.mobileImageId) : undefined;
  return {
    id: banner.id,
    title: banner.title,
    description: banner.description,
    destinationUrl: banner.destinationUrl,
    placement: banner.placement,
    priority: banner.priority,
    status: banner.status,
    startAt: banner.startAt ? banner.startAt.toISOString() : null,
    endAt: banner.endAt ? banner.endAt.toISOString() : null,
    sponsored: banner.sponsored,
    disclosure: banner.disclosure,
    sortOrder: banner.sortOrder,
    desktopImageId: banner.desktopImageId,
    mobileImageId: banner.mobileImageId,
    createdAt: banner.createdAt.toISOString(),
    updatedAt: banner.updatedAt.toISOString(),
    preview:
      desktop && mobile
        ? {
            id: banner.id,
            title: banner.title,
            description: banner.description,
            href: banner.destinationUrl,
            disclosure: banner.disclosure,
            image: {
              alt: banner.title,
              desktop: { src: `/api/admin/banners/media/${desktop.id}`, width: desktop.width, height: desktop.height },
              mobile: { src: `/api/admin/banners/media/${mobile.id}`, width: mobile.width, height: mobile.height },
            },
          }
        : null,
  };
}
