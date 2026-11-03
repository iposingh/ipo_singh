import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions, nestedSchemaOptions } from "../schema-options.ts";
import { sourceMetadataSchema } from "../source-metadata.ts";

const quoteSchema = new Schema(
  {
    priceRupees: { type: Number, default: null },
    priceDate: { type: String, default: null },
    observedAt: { type: Date, default: null },
    isStale: { type: Boolean, default: null },
    lotSizeShares: { type: Number, default: null },
    faceValueText: { type: String, default: null, maxlength: 40 },
    dealerLowRupees: { type: Number, default: null },
    dealerHighRupees: { type: Number, default: null },
    dealerMedianRupees: { type: Number, default: null },
  },
  nestedSchemaOptions,
);

const historySchema = new Schema(
  {
    observedAt: { type: Date, required: true },
    priceRupees: { type: Number, default: null },
  },
  nestedSchemaOptions,
);

const unlistedShareSchema = new Schema(
  {
    slug: { type: String, required: true, trim: true, maxlength: 80 },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    displayName: { type: String, default: null, maxlength: 200 },
    isin: { type: String, default: null, maxlength: 20 },
    sector: { type: String, default: null, maxlength: 80 },
    quoteKind: { type: String, required: true, enum: ["indicative_dealer_quote"] },
    priceSource: { type: String, default: null, enum: ["unlistedzone", "manual"] },
    quote: { type: quoteSchema, required: true },
    history: { type: [historySchema], default: [] },
    source: { type: sourceMetadataSchema, required: true },
  },
  { ...collectionSchemaOptions, collection: "unlisted_shares" },
);

unlistedShareSchema.index({ slug: 1 }, { unique: true });
unlistedShareSchema.index({ "quote.observedAt": 1 });

export const UnlistedShareModel = mongoose.models.UnlistedShare ?? mongoose.model("UnlistedShare", unlistedShareSchema);
