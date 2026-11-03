import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";

const deviceSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    client: { type: String, required: true, enum: ["web", "ios", "android"] },
    label: { type: String, default: null, maxlength: 80 },
    installationId: { type: String, default: null, maxlength: 36 },
    createdAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { ...collectionSchemaOptions, collection: "account_devices" },
);

deviceSchema.index({ userId: 1, lastSeenAt: -1 });
deviceSchema.index(
  { userId: 1, client: 1, installationId: 1 },
  { unique: true, partialFilterExpression: { installationId: { $type: "string" }, revokedAt: null } },
);

export const AccountDeviceModel = mongoose.models.AccountDevice ?? mongoose.model("AccountDevice", deviceSchema);
