import assert from "node:assert/strict";
import test from "node:test";
import type { BoardSectionState } from "./board-state.ts";
import { dashboardCounts } from "./dashboard-counts.ts";

function section(id: BoardSectionState["id"], patch: Partial<BoardSectionState> = {}): BoardSectionState {
  return {
    id,
    phase: "ready",
    message: null,
    items: [],
    nextCursor: null,
    totalCount: null,
    loadingMore: false,
    moreError: null,
    cacheReason: null,
    cacheNote: null,
    ...patch,
  };
}

test("dashboard counts prefer API totals and mark incomplete pages", () => {
  const counts = dashboardCounts([
    section("open", { totalCount: 3 }),
    section("upcoming", { totalCount: 0 }),
    section("allotment", {
      items: [{ id: "a" } as never, { id: "b" } as never],
      nextCursor: "next",
      totalCount: null,
    }),
    section("listed", { phase: "loading" }),
  ]);
  assert.deepEqual(
    counts.map((item) => ({ id: item.id, value: item.value, loading: item.loading })),
    [
      { id: "open", value: "3", loading: false },
      { id: "upcoming", value: "0", loading: false },
      { id: "allotment", value: "2+", loading: false },
      { id: "listed", value: "—", loading: true },
    ],
  );
});
