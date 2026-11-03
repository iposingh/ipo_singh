import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions, nestedSchemaOptions } from "../schema-options.ts";
import { sourceMetadataSchema } from "../source-metadata.ts";

const bookSchema = new Schema(
  {
    observedAt: { type: Date, default: null },
    offerDateText: { type: String, default: null, maxlength: 40 },
    updatedLabel: { type: String, default: null, maxlength: 80 },
    floorPriceRupees: { type: Number, default: null },
    indicativePriceRupees: { type: Number, default: null },
    lastTradedPriceRupees: { type: Number, default: null },
    subscriptionTimes: { type: Number, default: null },
    greenShoeSubscriptionTimes: { type: Number, default: null },
    totalQuantity: { type: Number, default: null },
    status: { type: String, default: null, maxlength: 40 },
  },
  nestedSchemaOptions,
);

const ofsIssueSchema = new Schema(
  {
    slug: { type: String, required: true, trim: true, maxlength: 80 },
    companyName: { type: String, required: true, trim: true, maxlength: 200 },
    shortName: { type: String, default: null, maxlength: 120 },
    category: { type: String, required: true, enum: ["retail", "non-retail", "other"] },
    status: { type: String, default: null, maxlength: 40 },
    openAt: { type: Date, default: null },
    closeAt: { type: Date, default: null },
    floorPriceRupees: { type: Number, default: null },
    discountRupees: { type: Number, default: null },
    nseSymbol: { type: String, default: null, maxlength: 40 },
    bseScripCode: { type: String, default: null, maxlength: 40 },
    subscriptionTimes: { type: Number, default: null },
    seller: { type: String, default: null, maxlength: 200 },
    sharesOffered: { type: Number, default: null },
    greenShoeShares: { type: Number, default: null },
    book: { type: bookSchema, default: null },
    source: { type: sourceMetadataSchema, required: true },
  },
  { ...collectionSchemaOptions, collection: "ofs_issues" },
);

ofsIssueSchema.index({ slug: 1 }, { unique: true });
ofsIssueSchema.index({ status: 1, openAt: 1 });

export const OfsIssueModel = mongoose.models.OfsIssue ?? mongoose.model("OfsIssue", ofsIssueSchema);
