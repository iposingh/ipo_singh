import { Schema } from "mongoose";
import { nestedSchemaOptions } from "./schema-options.ts";

/** Provenance stored on persistence documents. This is not an API response DTO. */
export const sourceMetadataSchema = new Schema(
  {
    source: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    fetchedAt: { type: Date, required: true },
    sourceUpdatedAt: { type: Date, default: null },
    freshness: { type: String, required: true, enum: ["missing", "fresh", "stale"] },
  },
  nestedSchemaOptions,
);
