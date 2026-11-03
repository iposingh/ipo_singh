import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";

const pushTokenSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    deviceId: { type: String, required: true },
    platform: { type: String, required: true, enum: ["ios", "android"] },
    token: { type: String, required: true, maxlength: 200 },
    status: { type: String, required: true, enum: ["active", "revoked", "invalid"] },
    ownerKind: { type: String, required: true, enum: ["user", "anonymous"], default: "user" },
    allotmentAlertsEnabled: { type: Boolean, required: true, default: true },
    mainboardGlobalAlerts: { type: Boolean, required: true, default: false },
    smeWatchlistAlerts: { type: Boolean, required: true, default: false },
    createdAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    invalidAt: { type: Date, default: null },
  },
  { ...collectionSchemaOptions, collection: "push_tokens" },
);

pushTokenSchema.index({ token: 1 }, { unique: true });
pushTokenSchema.index({ userId: 1, status: 1, lastSeenAt: -1 });

const pushAttemptSchema = new Schema(
  {
    _id: { type: String, required: true },
    notificationId: { type: String, required: true },
    tokenId: { type: String, required: true },
    userId: { type: String, required: true },
    attempt: { type: Number, required: true },
    status: { type: String, required: true, enum: ["sent", "failed", "invalid-token"] },
    providerError: { type: String, default: null, maxlength: 80 },
    ticketId: { type: String, default: null, maxlength: 120 },
    receiptCheckedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
  },
  { ...collectionSchemaOptions, collection: "push_attempts" },
);

pushAttemptSchema.index({ notificationId: 1, tokenId: 1, attempt: 1 }, { unique: true });
pushAttemptSchema.index({ status: 1, ticketId: 1, receiptCheckedAt: 1, createdAt: 1 });

export const PushTokenModel = mongoose.models.PushToken ?? mongoose.model("PushToken", pushTokenSchema);
export const PushAttemptModel = mongoose.models.PushAttempt ?? mongoose.model("PushAttempt", pushAttemptSchema);
