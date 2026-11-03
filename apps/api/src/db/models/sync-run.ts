import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";

const syncRunSchema = new Schema(
  {
    providerKey: { type: String, required: true, trim: true, maxlength: 40 },
    resource: { type: String, required: true, trim: true, maxlength: 40 },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    status: { type: String, required: true, enum: ["running", "succeeded", "failed"] },
    fetchedCount: { type: Number, required: true, min: 0 },
    errorName: { type: String, default: null, maxlength: 80 },
    expiresAt: { type: Date, required: true },
  },
  { ...collectionSchemaOptions, collection: "sync_runs" },
);

syncRunSchema.index({ providerKey: 1, resource: 1, startedAt: 1 }, { unique: true });
syncRunSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SyncRunModel = mongoose.models.SyncRun ?? mongoose.model("SyncRun", syncRunSchema);
