import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";

const notificationSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    type: { type: String, required: true },
    ipoId: { type: String, default: null },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 500 },
    createdAt: { type: Date, required: true },
    readAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    dedupeKey: { type: String, required: true, maxlength: 240 },
    inApp: { type: String, required: true },
    push: { type: String, required: true },
    sourceName: { type: String, default: null, maxlength: 80 },
    sourceObservedAt: { type: Date, default: null },
  },
  { ...collectionSchemaOptions, collection: "notifications" },
);

notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ push: 1, createdAt: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const baselineSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    ipoId: { type: String, required: true },
    openDate: { type: String, default: null },
    closeDate: { type: String, default: null },
    allotmentDate: { type: String, default: null },
    listingDate: { type: String, default: null },
    seenAt: { type: Date, required: true },
  },
  { ...collectionSchemaOptions, collection: "notification_baselines" },
);

baselineSchema.index({ userId: 1, ipoId: 1 }, { unique: true });

export const NotificationModel = mongoose.models.Notification ?? mongoose.model("Notification", notificationSchema);
export const NotificationBaselineModel = mongoose.models.NotificationBaseline ?? mongoose.model("NotificationBaseline", baselineSchema);
