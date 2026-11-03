import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";
import { sourceMetadataSchema } from "../source-metadata.ts";

const sourceDocumentSchema = new Schema(
  {
    ipoId: { type: String, required: true, trim: true, maxlength: 80 },
    kind: { type: String, required: true, enum: ["drhp", "rhp", "source"] },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    url: { type: String, required: true, maxlength: 2000 },
    publishedOn: { type: String, default: null },
    source: { type: sourceMetadataSchema, required: true },
  },
  { ...collectionSchemaOptions, collection: "source_documents" },
);

sourceDocumentSchema.index({ ipoId: 1, kind: 1, url: 1 }, { unique: true });

export const SourceDocumentModel =
  mongoose.models.SourceDocument ?? mongoose.model("SourceDocument", sourceDocumentSchema);
