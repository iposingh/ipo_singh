import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";

const bannerSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, maxlength: 80 },
    description: { type: String, required: true, maxlength: 180 },
    desktopImageId: { type: String, default: null },
    mobileImageId: { type: String, default: null },
    destinationUrl: { type: String, required: true, maxlength: 500 },
    placement: { type: String, required: true, enum: ["home"] },
    priority: { type: Number, required: true, min: 0, max: 100 },
    status: { type: String, required: true, enum: ["draft", "active", "archived"] },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    sponsored: { type: Boolean, required: true },
    disclosure: { type: String, default: null },
    sortOrder: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { ...collectionSchemaOptions, collection: "promotion_banners" },
);

bannerSchema.index({ placement: 1, status: 1, priority: -1, sortOrder: 1 });

const imageSchema = new Schema(
  {
    _id: { type: String, required: true },
    bannerId: { type: String, required: true },
    slot: { type: String, required: true, enum: ["desktop", "mobile"] },
    contentType: { type: String, required: true, enum: ["image/png", "image/jpeg", "image/webp"] },
    width: { type: Number, required: true, min: 1, max: 4000 },
    height: { type: Number, required: true, min: 1, max: 4000 },
    byteLength: { type: Number, required: true, min: 1, max: 800_000 },
    data: { type: Buffer, required: true },
    createdAt: { type: Date, required: true },
  },
  { ...collectionSchemaOptions, collection: "promotion_images" },
);

imageSchema.index({ bannerId: 1 });

export const PromotionBannerModel = mongoose.models.PromotionBanner ?? mongoose.model("PromotionBanner", bannerSchema);
export const PromotionImageModel = mongoose.models.PromotionImage ?? mongoose.model("PromotionImage", imageSchema);
