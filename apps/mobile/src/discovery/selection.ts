import { stableIdSchema } from "@ipo-singh/contracts";

export const compareMinimum = 2;
export const compareCapacity = 4;

export function canCompare(slugs: readonly string[]): boolean {
  return slugs.length >= compareMinimum && slugs.length <= compareCapacity && slugs.every((slug) => stableIdSchema.safeParse(slug).success);
}

export function toggleCompareSlug(slugs: readonly string[], slug: string): { slugs: string[]; rejected: "invalid" | "full" | null } {
  if (!stableIdSchema.safeParse(slug).success) return { slugs: [...slugs], rejected: "invalid" };
  if (slugs.includes(slug)) return { slugs: slugs.filter((item) => item !== slug), rejected: null };
  if (slugs.length >= compareCapacity) return { slugs: [...slugs], rejected: "full" };
  return { slugs: [...slugs, slug], rejected: null };
}

export function compareColumnWidth(screenWidth: number): { label: number; value: number } {
  if (screenWidth < 360) return { label: 112, value: 132 };
  return { label: 148, value: 168 };
}
