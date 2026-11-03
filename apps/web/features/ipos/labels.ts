import type { Board, IpoStatus } from "@ipo-singh/contracts";

export function boardLabel(board: Board): string {
  return board === "mainboard" ? "Mainboard" : "SME";
}

export function boardBrowseTitle(board: Board): string {
  return board === "mainboard" ? "Mainboard IPOs" : "SME IPOs";
}

export function statusLabel(status: IpoStatus | null): string {
  if (status === "upcoming") return "Upcoming";
  if (status === "open") return "Open";
  if (status === "closed") return "Closed";
  if (status === "allotment") return "Allotment Awaited";
  if (status === "listed") return "Listed";
  return "Status unavailable";
}

/**
 * List/detail lifecycle label. Allotment Awaited and Allotment Out stay distinct.
 * A passed allotment date alone is not Allotment Out. Listed stays Listed.
 */
export function listingLifecycleLabel(input: {
  status: IpoStatus | null;
  allotmentConfirmed?: boolean | null;
}): string {
  if (input.status === "listed" || input.status === "open" || input.status === "upcoming") {
    return statusLabel(input.status);
  }
  if (input.allotmentConfirmed === true) return "Allotment Out";
  if (input.status === "allotment" || input.status === "closed") return "Allotment Awaited";
  return statusLabel(input.status);
}
