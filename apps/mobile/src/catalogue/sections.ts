import type { Board, IpoStatus } from "@ipo-singh/contracts";

export const listingPageLimit = 20;

export type ListingSectionId = "open" | "upcoming" | "allotment" | "listed";

export type ListingSection = {
  id: ListingSectionId;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  /** API status filter. Closed also returns allotment issues from the catalogue. */
  status: IpoStatus;
  sort: "open" | "close" | "listing";
  direction: "asc" | "desc";
  summaryLabel: string;
};

/** Home dashboard sections. Closed asks the API for closed issues (API also includes allotment). */
export function listingSections(_board: Board): readonly ListingSection[] {
  return [
    {
      id: "open",
      title: "Open IPOs",
      description: "Issues accepting applications now.",
      emptyTitle: "No open IPOs right now.",
      emptyDescription: "When an issue opens for bidding, it appears here.",
      status: "open",
      sort: "close",
      direction: "asc",
      summaryLabel: "Open",
    },
    {
      id: "upcoming",
      title: "Upcoming IPOs",
      description: "Issues scheduled to open.",
      emptyTitle: "No upcoming IPOs available.",
      emptyDescription: "Scheduled openings appear here when stored by IPO Singh.",
      status: "upcoming",
      sort: "open",
      direction: "asc",
      summaryLabel: "Upcoming",
    },
    {
      id: "allotment",
      title: "Allotment Awaited / Allotment Out",
      description: "Closed issues waiting for allotment, and confirmed allotment results.",
      emptyTitle: "No allotment IPOs right now.",
      emptyDescription: "Closed and allotment issues appear here from the IPO Singh catalogue.",
      status: "closed",
      sort: "close",
      direction: "desc",
      summaryLabel: "Allotment",
    },
    {
      id: "listed",
      title: "Recently Listed IPOs",
      description: "Issues that have listed.",
      emptyTitle: "No recently listed IPOs.",
      emptyDescription: "Listed issues appear here when listing details are stored.",
      status: "listed",
      sort: "listing",
      direction: "desc",
      summaryLabel: "Listed",
    },
  ];
}

export function listingRequestPath(board: Board, section: ListingSection, cursor?: string): string {
  const params = new URLSearchParams();
  params.set("board", board);
  params.set("status", section.status);
  params.set("sort", section.sort);
  params.set("direction", section.direction);
  params.set("limit", String(listingPageLimit));
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/ipos?${params.toString()}`;
}
