import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";

const accountSessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    deviceId: { type: String, required: true },
    client: { type: String, required: true, enum: ["web", "ios", "android"] },
    accessTokenHash: { type: String, required: true },
    refreshTokenHash: { type: String, required: true },
    previousRefreshTokenHash: { type: String, default: null },
    csrfTokenHash: { type: String, required: true },
    accessExpiresAt: { type: Date, required: true },
    refreshExpiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    rotatedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokeReason: {
      type: String,
      enum: ["user", "rotation_reuse", "suspended", "closed", "operator", "expired", null],
      default: null,
    },
  },
  { ...collectionSchemaOptions, collection: "account_sessions" },
);

accountSessionSchema.index({ accessTokenHash: 1 }, { unique: true });
accountSessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
accountSessionSchema.index({ previousRefreshTokenHash: 1 });
accountSessionSchema.index({ userId: 1, revokedAt: 1 });

export const AccountSessionModel = mongoose.models.AccountSession ?? mongoose.model("AccountSession", accountSessionSchema);
