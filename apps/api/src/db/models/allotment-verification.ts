import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";

const allotmentVerificationSchema = new Schema(
  {
    _id: { type: String, required: true },
    registrarId: { type: String, default: null },
    verificationStatus: {
      type: String,
      required: true,
      enum: ["unconfirmed", "confirmed", "failed", "unsupported", "inconclusive"],
    },
    allotmentConfirmed: { type: Boolean, required: true, default: false },
    verificationSource: { type: String, default: null },
    verificationEvidence: { type: String, default: null },
    verificationMethod: { type: String, default: null },
    sourceUrl: { type: String, default: null },
    matchedCompanyId: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    monitoringStartedAt: { type: Date, default: null },
    lastCheckedAt: { type: Date, required: true },
    nextCheckAt: { type: Date, default: null },
    note: { type: String, required: true },
    notificationDispatch: {
      type: String,
      required: true,
      enum: ["not-sent", "queued", "sent", "failed", "skipped"],
      default: "not-sent",
    },
    notificationEligibleDevices: { type: Number, default: null },
    notificationAccepted: { type: Number, default: null },
    notificationRejected: { type: Number, default: null },
    errorName: { type: String, default: null },
  },
  { ...collectionSchemaOptions, collection: "allotment_verifications" },
);

allotmentVerificationSchema.index({ allotmentConfirmed: 1, nextCheckAt: 1 });
allotmentVerificationSchema.index({ verificationStatus: 1 });

export const AllotmentVerificationModel =
  mongoose.models.AllotmentVerification ?? mongoose.model("AllotmentVerification", allotmentVerificationSchema);
