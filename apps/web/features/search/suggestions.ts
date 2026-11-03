import type { Board, IpoStatus, IpoSummary } from "@ipo-singh/contracts";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const statuses = ["upcoming", "open", "closed", "allotment", "listed"] as const;

export const suggestionLimit = 8;

export type SearchSuggestion = {
  slug: string;
  companyName: string;
  board: Board;
  status: IpoStatus | null;
  allotmentConfirmed?: boolean;
};

export function suggestionRequestKey(input: { q: string; board: string; status: string; from: string; to: string }): string {
  return JSON.stringify({ q: input.q, board: input.board, status: input.status, from: input.from, to: input.to });
}

export function shouldRequestSuggestions(text: string, enabled: boolean, key: string, completedKey: string | null): boolean {
  if (!enabled || text.length < 2) return false;
  return key !== completedKey;
}

export function nextSuggestionIndex(current: number, key: string, count: number): number | "close" | "submit" | "unchanged" {
  if (key === "Escape") return "close";
  if (key === "Enter") return "submit";
  if (count <= 0) return "unchanged";
  if (key === "ArrowDown") return current >= count - 1 ? 0 : current + 1;
  if (key === "ArrowUp") return current <= 0 ? count - 1 : current - 1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return "unchanged";
}

export function publicSuggestions(items: readonly IpoSummary[]): SearchSuggestion[] {
  return items.map((item) => ({
    slug: item.slug,
    companyName: item.companyName,
    board: item.board,
    status: item.status,
    ...(item.allotmentConfirmed === true ? { allotmentConfirmed: true as const } : {}),
  }));
}

export function parseSuggestionResponse(body: unknown): { items: SearchSuggestion[]; rejected: boolean } {
  if (!body || typeof body !== "object") return { items: [], rejected: false };
  const record = body as Record<string, unknown>;
  const rejected = record.rejected === true;
  if (!Array.isArray(record.items)) return { items: [], rejected };
  const items: SearchSuggestion[] = [];
  for (const item of record.items) {
    const suggestion = readSuggestion(item);
    if (suggestion) items.push(suggestion);
  }
  return { items, rejected };
}

function readSuggestion(value: unknown): SearchSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.slug !== "string" || !slugPattern.test(record.slug) || record.slug.length > 80) return null;
  if (typeof record.companyName !== "string") return null;
  const companyName = record.companyName.trim();
  if (!companyName || companyName.length > 200) return null;
  if (record.board !== "mainboard" && record.board !== "sme") return null;
  const status = readStatus(record.status);
  if (status === undefined) return null;
  return {
    slug: record.slug,
    companyName,
    board: record.board,
    status,
    ...(record.allotmentConfirmed === true ? { allotmentConfirmed: true as const } : {}),
  };
}

function readStatus(value: unknown): IpoStatus | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return statuses.find((status) => status === value);
}
