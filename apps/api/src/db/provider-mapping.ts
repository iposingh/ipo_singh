import { Schema } from "mongoose";
import { nestedSchemaOptions } from "./schema-options.ts";

/** Maps a stable IPO Singh id to an external provider id. Provider names stay generic. */
export const providerMappingSchema = new Schema(
  {
    providerKey: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
    externalId: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  },
  nestedSchemaOptions,
);
