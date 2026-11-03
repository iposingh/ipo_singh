import mongoose, { Schema } from "mongoose";
import { collectionSchemaOptions } from "../schema-options.ts";
import { sourceMetadataSchema } from "../source-metadata.ts";

const financialStatementSchema = new Schema(
  {
    companyId: { type: String, required: true, trim: true, maxlength: 80 },
    fiscalYearLabel: { type: String, required: true, trim: true, maxlength: 20 },
    revenueRupees: { type: Number, default: null },
    profitAfterTaxRupees: { type: Number, default: null },
    earningsPerShareRupees: { type: Number, default: null },
    source: { type: sourceMetadataSchema, required: true },
  },
  { ...collectionSchemaOptions, collection: "financial_statements" },
);

financialStatementSchema.index({ companyId: 1, fiscalYearLabel: 1 }, { unique: true });

export const FinancialStatementModel =
  mongoose.models.FinancialStatement ?? mongoose.model("FinancialStatement", financialStatementSchema);
