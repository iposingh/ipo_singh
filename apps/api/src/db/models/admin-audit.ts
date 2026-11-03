import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";

const adminAuditSchema = new Schema(
  {
    _id: { type: String, required: true },
    actorUserId: { type: String, required: true },
    action: {
      type: String,
      required: true,
      enum: ["access_denied", "role_change", "session_revoke", "provider_read", "bootstrap", "manual_sync", "banner_change"],
    },
    outcome: { type: String, required: true, enum: ["succeeded", "denied"] },
    targetUserId: { type: String, default: null },
    createdAt: { type: Date, required: true },
  },
  { ...collectionSchemaOptions, collection: "admin_audit_events" },
);

adminAuditSchema.index({ createdAt: -1 });

export const AdminAuditModel = mongoose.models.AdminAuditEvent ?? mongoose.model("AdminAuditEvent", adminAuditSchema);
