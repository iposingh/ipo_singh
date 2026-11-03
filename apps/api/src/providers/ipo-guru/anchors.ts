import { ipoAnchorsSchema, type IpoAnchors } from "@ipo-singh/contracts";
import { recordValidationFailure } from "../../ops/validation.ts";

/**
 * Maps one `GET /ipos/{slug}/anchors` document.
 * Amounts stay in ₹ crore, the unit the provider publishes.
 * An empty investor list before allocation is a successful empty book.
 * Returns null when the document is not an anchor book.
 */
export function mapAnchors(payload: unknown): IpoAnchors | null {
  if (!isRecord(payload) || !Array.isArray(payload.anchors)) {
    recordValidationFailure();
    return null;
  }
  const summary = isRecord(payload.summary) ? payload.summary : {};
  const investors = payload.anchors.flatMap((row) => {
    if (!isRecord(row) || typeof row.name !== "string" || row.name.trim().length === 0) {
      recordValidationFailure();
      return [];
    }
    const group = typeof row.group_entity === "string" && row.group_entity.trim() ? clip(row.group_entity, 200) : null;
    return [
      {
        name: clip(row.name, 200),
        group,
        shares: count(row.shares_allotted),
        amountCrore: crore(row.amount_cr),
        allocatedPercent: percent(row.pct_allocated),
        issuePercent: percent(row.pct_allotment_of_issue),
      },
    ];
  });
  const parsed = ipoAnchorsSchema.safeParse({
    totalCount: count(summary.total_anchors),
    totalAmountCrore: crore(summary.total_amount_cr),
    mutualFundCount: count(summary.mutual_fund_count),
    investors: investors.slice(0, 400),
  });
  if (!parsed.success) {
    recordValidationFailure();
    return null;
  }
  return parsed.data;
}

function count(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    recordValidationFailure();
    return null;
  }
  return parsed;
}

function crore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    recordValidationFailure();
    return null;
  }
  return parsed;
}

function percent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    recordValidationFailure();
    return null;
  }
  return parsed;
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
