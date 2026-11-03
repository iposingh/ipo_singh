import { PromotionBannerModel, PromotionImageModel } from "../db/models/promotion.ts";
import type { BannerDisclosure, BannerImageRecord, BannerRecord, BannerStatus, PromotionImageType, PromotionStore } from "./records.ts";

type BannerDoc = {
  _id: string;
  title: string;
  description: string;
  desktopImageId: string | null;
  mobileImageId: string | null;
  destinationUrl: string;
  placement: "home";
  priority: number;
  status: BannerStatus;
  startAt: Date | null;
  endAt: Date | null;
  sponsored: boolean;
  disclosure: BannerDisclosure;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type ImageDoc = {
  _id: string;
  bannerId: string;
  slot: "desktop" | "mobile";
  contentType: PromotionImageType;
  width: number;
  height: number;
  byteLength: number;
  data: Buffer;
  createdAt: Date;
};

function bannerFrom(doc: BannerDoc): BannerRecord {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    desktopImageId: doc.desktopImageId,
    mobileImageId: doc.mobileImageId,
    destinationUrl: doc.destinationUrl,
    placement: "home",
    priority: doc.priority,
    status: doc.status,
    startAt: doc.startAt,
    endAt: doc.endAt,
    sponsored: doc.sponsored,
    disclosure: doc.disclosure,
    sortOrder: doc.sortOrder,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function imageBytes(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value && typeof value === "object" && "buffer" in value && "position" in value) {
    const binary = value as { buffer: Uint8Array; position: number };
    if (binary.buffer instanceof Uint8Array && Number.isInteger(binary.position) && binary.position >= 0) {
      return Buffer.from(binary.buffer.subarray(0, binary.position));
    }
  }
  return Buffer.alloc(0);
}

function imageFrom(doc: ImageDoc): BannerImageRecord {
  return {
    id: doc._id,
    bannerId: doc.bannerId,
    slot: doc.slot,
    contentType: doc.contentType,
    width: doc.width,
    height: doc.height,
    byteLength: doc.byteLength,
    data: imageBytes(doc.data),
    createdAt: doc.createdAt,
  };
}

export function createMongoPromotionStore(): PromotionStore {
  return {
    async list() {
      const docs = await PromotionBannerModel.find().sort({ priority: -1, sortOrder: 1 }).limit(50).lean<BannerDoc[]>();
      return docs.map(bannerFrom);
    },
    async find(id) {
      const doc = await PromotionBannerModel.findById(id).lean<BannerDoc | null>();
      return doc ? bannerFrom(doc) : null;
    },
    async insert(record) {
      await PromotionBannerModel.create({ _id: record.id, ...record, id: undefined });
    },
    async save(record) {
      await PromotionBannerModel.updateOne({ _id: record.id }, { $set: { ...record, id: undefined } });
    },
    async remove(id) {
      const result = await PromotionBannerModel.deleteOne({ _id: id });
      return result.deletedCount === 1;
    },
    async saveImage(image) {
      await PromotionImageModel.updateOne(
        { _id: image.id },
        {
          $set: {
            bannerId: image.bannerId,
            slot: image.slot,
            contentType: image.contentType,
            width: image.width,
            height: image.height,
            byteLength: image.byteLength,
            data: image.data,
            createdAt: image.createdAt,
          },
        },
        { upsert: true },
      );
    },
    async findImage(id) {
      const doc = await PromotionImageModel.findById(id).lean<ImageDoc | null>();
      return doc ? imageFrom(doc) : null;
    },
    async deleteImage(id) {
      await PromotionImageModel.deleteOne({ _id: id });
    },
    async deleteImagesForBanner(bannerId) {
      await PromotionImageModel.deleteMany({ bannerId });
    },
  };
}
