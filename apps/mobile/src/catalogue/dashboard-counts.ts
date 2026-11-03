import type { BoardSectionState } from "./board-state.ts";
import { listingSections, type ListingSectionId } from "./sections.ts";

export type DashboardCount = {
  id: ListingSectionId;
  label: string;
  value: string;
  numeric: number | null;
  loading: boolean;
};

/**
 * Builds summary counts from loaded section pages.
 * Prefers API totalCount. Falls back to loaded item length; appends + when more pages exist.
 */
export function dashboardCounts(sections: readonly BoardSectionState[]): readonly DashboardCount[] {
  const specs = listingSections("mainboard");
  return specs.map((spec) => {
    const state = sections.find((item) => item.id === spec.id);
    if (!state || state.phase === "loading") {
      return { id: spec.id, label: spec.summaryLabel, value: "—", numeric: null, loading: true };
    }
    if (state.phase === "error") {
      return { id: spec.id, label: spec.summaryLabel, value: "—", numeric: null, loading: false };
    }
    const total = state.totalCount;
    if (typeof total === "number") {
      return { id: spec.id, label: spec.summaryLabel, value: String(total), numeric: total, loading: false };
    }
    const loaded = state.items.length;
    const value = state.nextCursor ? `${loaded}+` : String(loaded);
    return { id: spec.id, label: spec.summaryLabel, value, numeric: loaded, loading: false };
  });
}
