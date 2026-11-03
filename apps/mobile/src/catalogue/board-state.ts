import type { Ipo, IpoSummary } from "@ipo-singh/contracts";
import type { ListingSectionId } from "./sections.ts";

export type DetailSlot = { phase: "ready"; ipo: Ipo } | { phase: "unavailable" };

export type BoardSectionState = {
  id: ListingSectionId;
  phase: "loading" | "error" | "ready";
  message: string | null;
  items: IpoSummary[];
  nextCursor: string | null;
  /** API total when known. Null when the catalogue omits it. */
  totalCount: number | null;
  loadingMore: boolean;
  moreError: string | null;
  cacheReason: "fresh" | "offline" | "fallback" | null;
  cacheNote: string | null;
};
