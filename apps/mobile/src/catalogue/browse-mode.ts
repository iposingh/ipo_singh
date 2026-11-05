import type { ListingSectionId } from "./sections.ts";

/** Top segmented control on Mainboard / SME list screens. */
export type BrowseMode = "current" | "listed";

export const browseModeChoices: readonly { id: BrowseMode; label: string }[] = [
  { id: "current", label: "Current & Upcoming" },
  { id: "listed", label: "Listed" },
];

/** Which dashboard sections feed each browse mode. */
export function sectionIdsForBrowseMode(mode: BrowseMode): readonly ListingSectionId[] {
  if (mode === "listed") return ["listed"];
  return ["open", "upcoming", "allotment"];
}
