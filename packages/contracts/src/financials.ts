import { z } from "zod";
import { finiteNumberSchema } from "./primitives.ts";

const statementAmountSchema = finiteNumberSchema.nullable();

export const financialPeriodSchema = z
  .object({
    fiscalYearLabel: z.string().trim().min(1).max(20),
    revenueRupees: statementAmountSchema,
    profitAfterTaxRupees: statementAmountSchema,
    earningsPerShareRupees: statementAmountSchema,
  })
  .strict();

export type FinancialPeriod = z.infer<typeof financialPeriodSchema>;
