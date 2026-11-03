export const ipoDetailSections = [
  { id: "overview", label: "Overview" },
  { id: "gmp", label: "GMP*" },
  { id: "subscription", label: "Subscription" },
  { id: "financials", label: "Financials" },
  { id: "allotment", label: "Allotment" },
  { id: "listing", label: "Listing" },
  { id: "documents", label: "Documents" },
] as const;

export type IpoDetailSectionId = (typeof ipoDetailSections)[number]["id"];

const sectionIds = new Set<string>(ipoDetailSections.map((section) => section.id));

/** In-page anchor. The hash stays in the address after refresh. */
export function ipoDetailSectionHref(id: IpoDetailSectionId): string {
  return `#${id}`;
}

export function isIpoDetailSectionId(value: string): value is IpoDetailSectionId {
  return sectionIds.has(value);
}
