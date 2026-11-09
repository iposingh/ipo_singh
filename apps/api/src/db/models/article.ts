import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";

const citationSchema = new Schema(
  {
    label: { type: String, required: true, maxlength: 160 },
    url: { type: String, required: true, maxlength: 2000 },
  },
  { _id: false },
);

const coverSchema = new Schema(
  {
    url: { type: String, required: true, maxlength: 2000 },
    alt: { type: String, required: true, maxlength: 120 },
  },
  { _id: false },
);

const coverImageSchema = new Schema(
  {
    contentType: { type: String, required: true, enum: ["image/png", "image/jpeg", "image/webp"] },
    width: { type: Number, required: true, min: 1, max: 4000 },
    height: { type: Number, required: true, min: 1, max: 4000 },
    byteLength: { type: Number, required: true, min: 1, max: 5_000_000 },
    data: { type: Buffer, required: true },
    updatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const articleSchema = new Schema(
  {
    _id: { type: String, required: true },
    slug: { type: String, required: true, trim: true, maxlength: 120 },
    title: { type: String, required: true, maxlength: 160 },
    summary: { type: String, required: true, maxlength: 400 },
    category: {
      type: String,
      required: true,
      enum: ["ipo-updates", "market-news", "gmp-updates", "allotment-updates", "listing-updates", "general"],
    },
    status: { type: String, required: true, enum: ["draft", "published", "archived"] },
    authorName: { type: String, required: true, maxlength: 80 },
    sourceName: { type: String, required: true, maxlength: 120 },
    publishedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    bodyMarkdown: { type: String, required: true, maxlength: 50_000 },
    relatedIpoSlugs: { type: [String], default: [] },
    citations: { type: [citationSchema], default: [] },
    evergreen: { type: Boolean, required: true, default: false },
    cover: { type: coverSchema, default: null },
    coverImage: { type: coverImageSchema, default: null },
    seoDescription: { type: String, default: null, maxlength: 300 },
    createdBy: { type: String, default: null, maxlength: 80 },
    updatedBy: { type: String, default: null, maxlength: 80 },
  },
  { ...collectionSchemaOptions, collection: "articles" },
);

articleSchema.index({ slug: 1 }, { unique: true });
articleSchema.index({ status: 1, publishedAt: -1 });
articleSchema.index({ category: 1, status: 1, publishedAt: -1 });

export const ArticleModel = mongoose.models.Article ?? mongoose.model("Article", articleSchema);
