import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions, nestedSchemaOptions } from "../schema-options.ts";

const notificationCategoriesSchema = new Schema(
  {
    open: { type: Boolean, required: true, default: false },
    closing: { type: Boolean, required: true, default: false },
    gmp: { type: Boolean, required: true, default: false },
    subscription: { type: Boolean, required: true, default: false },
    allotment: { type: Boolean, required: true, default: false },
    listing: { type: Boolean, required: true, default: false },
    schedule: { type: Boolean, required: true, default: false },
    announcement: { type: Boolean, required: true, default: false },
  },
  nestedSchemaOptions,
);

const watchlistDisplaySchema = new Schema(
  {
    density: { type: String, required: true, enum: ["comfortable", "compact"], default: "comfortable" },
    showGmp: { type: Boolean, required: true, default: true },
    showSubscription: { type: Boolean, required: true, default: true },
    showDates: { type: Boolean, required: true, default: true },
  },
  nestedSchemaOptions,
);

const preferencesSchema = new Schema(
  {
    colorScheme: { type: String, required: true, enum: ["system", "light", "dark"] },
    defaultBoard: { type: String, enum: ["mainboard", "sme", null], default: null },
    timeZone: { type: String, required: true, enum: ["Asia/Kolkata"] },
    alertsEnabled: { type: Boolean, required: true, default: false },
    notificationCategories: { type: notificationCategoriesSchema, required: true },
    watchlistDisplay: { type: watchlistDisplaySchema, required: true },
    mobilePush: { type: String, required: true, enum: ["off", "when-available"], default: "off" },
  },
  nestedSchemaOptions,
);

const userSchema = new Schema(
  {
    _id: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    displayName: { type: String, default: null, maxlength: 80 },
    status: { type: String, required: true, enum: ["pending", "active", "suspended", "closed"] },
    role: { type: String, required: true, enum: ["member", "admin", "super-admin"] },
    preferences: { type: preferencesSchema, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    statusChangedAt: { type: Date, required: true },
    lastAuthenticatedAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    passwordHash: { type: String, default: null, maxlength: 300 },
  },
  { ...collectionSchemaOptions, collection: "account_users" },
);

userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
userSchema.index({ status: 1 });

export const AccountUserModel = mongoose.models.AccountUser ?? mongoose.model("AccountUser", userSchema);
