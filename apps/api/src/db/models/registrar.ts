import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";
import { sourceMetadataSchema } from "../source-metadata.ts";

const registrarSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    websiteUrl: { type: String, default: null },
    allotmentUrl: { type: String, default: null },
    source: { type: sourceMetadataSchema, required: true },
  },
  { ...collectionSchemaOptions, collection: "registrars" },
);

registrarSchema.index({ name: 1 });

export const RegistrarModel = mongoose.models.Registrar ?? mongoose.model("Registrar", registrarSchema);
