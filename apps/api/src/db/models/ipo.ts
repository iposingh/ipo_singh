import mongoose, { Schema } from "mongoose";
import { providerMappingSchema } from "../provider-mapping.ts";
import { collectionSchemaOptions, nestedSchemaOptions } from "../schema-options.ts";
import { sourceMetadataSchema } from "../source-metadata.ts";

const issueSchema = new Schema(
  {
    priceBandLowRupees: { type: Number, default: null },
    priceBandHighRupees: { type: Number, default: null },
    issuePriceRupees: { type: Number, default: null },
    issueSizeRupees: { type: Number, default: null },
    lotSizeShares: { type: Number, default: null },
    minimumInvestmentRupees: { type: Number, default: null },
  },
  nestedSchemaOptions,
);

const issueDatesSchema = new Schema(
  {
    openDate: { type: String, default: null },
    closeDate: { type: String, default: null },
    allotmentDate: { type: String, default: null },
    listingDate: { type: String, default: null },
  },
  nestedSchemaOptions,
);

const listingSchema = new Schema(
  {
    issuePriceRupees: { type: Number, default: null },
    listingPriceRupees: { type: Number, default: null },
    gainPercent: { type: Number, default: null },
    listedOn: { type: String, default: null },
  },
  nestedSchemaOptions,
);

const ipoSchema = new Schema(
  {
    _id: { type: String, required: true },
    slug: { type: String, required: true, trim: true, maxlength: 80 },
    companyId: { type: String, required: true, trim: true, maxlength: 80 },
    board: { type: String, required: true, enum: ["mainboard", "sme"] },
    status: {
      type: String,
      enum: [null, "upcoming", "open", "closed", "allotment", "listed"],
      default: null,
    },
    issue: { type: issueSchema, required: true },
    dates: { type: issueDatesSchema, required: true },
    listing: { type: listingSchema, default: null },
    registrarId: { type: String, default: null },
    providerMappings: { type: [providerMappingSchema], default: [] },
    profile: { type: Schema.Types.Mixed, default: null },
    allotmentConfirmed: { type: Boolean, default: undefined },
    allotmentConfirmedAt: { type: Date, default: undefined },
    source: { type: sourceMetadataSchema, required: true },
  },
  { ...collectionSchemaOptions, collection: "ipos" },
);

ipoSchema.index({ slug: 1 }, { unique: true });
ipoSchema.index({ companyId: 1 });
ipoSchema.index({ status: 1 });
ipoSchema.index({ board: 1 });
/** Board + status lists (Mainboard/SME open, upcoming, closed/allotment, listed). Additive only. */
ipoSchema.index({ board: 1, status: 1, "dates.openDate": -1 });
ipoSchema.index({ "dates.openDate": 1 });
ipoSchema.index({ "dates.closeDate": 1 });
ipoSchema.index({ "dates.allotmentDate": 1 });
ipoSchema.index({ "dates.listingDate": 1 });
ipoSchema.index(
  { "providerMappings.providerKey": 1, "providerMappings.externalId": 1 },
  { unique: true, sparse: true },
);

export const IpoModel = mongoose.models.Ipo ?? mongoose.model("Ipo", ipoSchema);
