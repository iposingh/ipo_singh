import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";

const providerUsageSchema = new Schema(
  {
    providerKey: { type: String, required: true, trim: true, maxlength: 40 },
    endpoint: { type: String, required: true, maxlength: 200 },
    usageId: { type: String, required: true, maxlength: 80 },
    requestedAt: { type: Date, required: true },
    statusCode: { type: Number, required: true, min: 0, max: 599 },
    durationMs: { type: Number, default: null, min: 0, max: 120_000 },
    expiresAt: { type: Date, required: true },
  },
  { ...collectionSchemaOptions, collection: "provider_usage" },
);

providerUsageSchema.index({ providerKey: 1, usageId: 1 }, { unique: true });
providerUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ProviderUsageModel = mongoose.models.ProviderUsage ?? mongoose.model("ProviderUsage", providerUsageSchema);
