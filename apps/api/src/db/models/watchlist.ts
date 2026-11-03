import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";

const watchlistSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    ipoId: { type: String, required: true, trim: true, maxlength: 80 },
    addedAt: { type: Date, required: true },
    note: { type: String, default: null, maxlength: 280 },
  },
  { ...collectionSchemaOptions, collection: "watchlist_items" },
);

watchlistSchema.index({ userId: 1, ipoId: 1 }, { unique: true });
watchlistSchema.index({ userId: 1, addedAt: -1 });
watchlistSchema.index({ ipoId: 1, addedAt: -1 });

export const WatchlistModel = mongoose.models.WatchlistItem ?? mongoose.model("WatchlistItem", watchlistSchema);
