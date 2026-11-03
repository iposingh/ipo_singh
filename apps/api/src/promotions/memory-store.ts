import type { BannerImageRecord, BannerRecord, PromotionStore } from "./records.ts";

export function createMemoryPromotionStore(): PromotionStore {
  const banners = new Map<string, BannerRecord>();
  const images = new Map<string, BannerImageRecord>();

  return {
    async list() {
      return [...banners.values()].sort((left, right) => right.priority - left.priority || left.sortOrder - right.sortOrder);
    },
    async find(id) {
      return banners.get(id) ?? null;
    },
    async insert(record) {
      banners.set(record.id, record);
    },
    async save(record) {
      banners.set(record.id, record);
    },
    async remove(id) {
      return banners.delete(id);
    },
    async saveImage(image) {
      images.set(image.id, { ...image, data: Buffer.from(image.data) });
    },
    async findImage(id) {
      const image = images.get(id);
      return image ? { ...image, data: Buffer.from(image.data) } : null;
    },
    async deleteImage(id) {
      images.delete(id);
    },
    async deleteImagesForBanner(bannerId) {
      for (const [id, image] of images) {
        if (image.bannerId === bannerId) images.delete(id);
      }
    },
  };
}
