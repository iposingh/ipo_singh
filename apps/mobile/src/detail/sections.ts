export const detailSections = [
  { id: "overview", label: "Overview" },
  { id: "gmp", label: "GMP" },
  { id: "subscription", label: "Subscription" },
  { id: "financials", label: "Financials" },
  { id: "allotment", label: "Allotment" },
  { id: "listing", label: "Listing" },
  { id: "documents", label: "Documents" },
] as const;

export type DetailSectionId = (typeof detailSections)[number]["id"];

const sectionIds = new Set<string>(detailSections.map((section) => section.id));

export function isDetailSectionId(value: string): value is DetailSectionId {
  return sectionIds.has(value);
}
