import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";
import { sourceMetadataSchema } from "../source-metadata.ts";

const gmpHistoryWindowSchema = new Schema(
  {
    _id: { type: String, required: true },
    ipoId: { type: String, required: true, trim: true, maxlength: 80 },
    highRupees: { type: Number, default: null },
    highOn: { type: String, default: null },
    lowRupees: { type: Number, default: null },
    lowOn: { type: String, default: null },
    truncated: { type: Boolean, required: true },
    timelineLocked: { type: Boolean, required: true },
    source: { type: sourceMetadataSchema, required: true },
  },
  { ...collectionSchemaOptions, collection: "gmp_history_windows" },
);

gmpHistoryWindowSchema.index({ ipoId: 1 }, { unique: true });

export const GmpHistoryWindowModel =
  mongoose.models.GmpHistoryWindow ?? mongoose.model("GmpHistoryWindow", gmpHistoryWindowSchema);
