import type { ListingLoadStatus } from "@/lib/api/ipo-singh";

export type ListingFailure = Exclude<ListingLoadStatus, "ready">;

export function listingFailureCopy(status: ListingFailure, title: string): { title: string; message: string } {
  if (status === "backend") {
    return {
      title: `${title} could not be reached`,
      message: "The IPO Singh service did not respond. No sample issues were substituted, and this is not an empty list.",
    };
  }
  if (status === "database") {
    return {
      title: `${title} could not be read`,
      message: "The catalogue database is unavailable. No sample issues were substituted, and this is not an empty list.",
    };
  }
  if (status === "rate_limited") {
    return {
      title: `${title} is temporarily busy`,
      message: "The catalogue received too many requests. Wait a moment and try again. No sample issues were substituted.",
    };
  }
  return {
    title: `${title} could not be loaded`,
    message: "The catalogue response could not be used. No sample issues were substituted, and this is not an empty list.",
  };
}
