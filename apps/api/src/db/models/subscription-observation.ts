import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions, nestedSchemaOptions } from "../schema-options.ts";
import { sourceMetadataSchema } from "../source-metadata.ts";

const subscriptionSubcategorySchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 32 },
    times: { type: Number, default: null },
  },
  nestedSchemaOptions,
);

const subscriptionCategorySchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 32 },
    times: { type: Number, default: null },
    subcategories: { type: [subscriptionSubcategorySchema], default: [] },
  },
  nestedSchemaOptions,
);

const subscriptionObservationSchema = new Schema(
  {
    ipoId: { type: String, required: true, trim: true, maxlength: 80 },
    observedAt: { type: Date, default: null },
    observedOn: { type: String, default: null },
    biddingDay: { type: Number, default: null },
    cadence: { type: String, enum: ["live", "daily", null], default: null },
    retailTimes: { type: Number, default: null },
    qibTimes: { type: Number, default: null },
    niiTimes: { type: Number, default: null },
    employeeTimes: { type: Number, default: null },
    shareholderTimes: { type: Number, default: null },
    anchorTimes: { type: Number, default: null },
    categories: { type: [subscriptionCategorySchema], default: [] },
    totalTimes: { type: Number, default: null },
    source: { type: sourceMetadataSchema, required: true },
    expiresAt: { type: Date, required: true },
  },
  { ...collectionSchemaOptions, collection: "subscription_observations" },
);

subscriptionObservationSchema.index({ ipoId: 1, cadence: 1, observedOn: 1, observedAt: 1 }, { unique: true });
subscriptionObservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SubscriptionObservationModel =
  mongoose.models.SubscriptionObservation ?? mongoose.model("SubscriptionObservation", subscriptionObservationSchema);
