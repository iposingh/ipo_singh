import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";
import { sourceMetadataSchema } from "../source-metadata.ts";

const gmpObservationSchema = new Schema(
  {
    ipoId: { type: String, required: true, trim: true, maxlength: 80 },
    observedAt: { type: Date, required: true },
    observedOn: { type: String, default: null },
    session: { type: String, required: true, enum: ["daily", "intraday"] },
    amountRupees: { type: Number, default: null },
    percent: { type: Number, default: null },
    indicativeImpliedPriceRupees: { type: Number, default: null },
    slotLabel: { type: String, default: null },
    source: { type: sourceMetadataSchema, required: true },
    expiresAt: { type: Date, required: true },
  },
  { ...collectionSchemaOptions, collection: "gmp_observations" },
);

gmpObservationSchema.index({ ipoId: 1, observedAt: 1, session: 1 }, { unique: true });
gmpObservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GmpObservationModel =
  mongoose.models.GmpObservation ?? mongoose.model("GmpObservation", gmpObservationSchema);
