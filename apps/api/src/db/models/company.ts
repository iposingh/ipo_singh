import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";
import { sourceMetadataSchema } from "../source-metadata.ts";

const companySchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    symbol: { type: String, default: null },
    source: { type: sourceMetadataSchema, required: true },
  },
  { ...collectionSchemaOptions, collection: "companies" },
);

companySchema.index({ name: 1 });
companySchema.index({ symbol: 1 }, { sparse: true });

export const CompanyModel = mongoose.models.Company ?? mongoose.model("Company", companySchema);
