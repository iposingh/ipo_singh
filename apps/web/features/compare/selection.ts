import { stableIdSchema } from "@ipo-singh/contracts";

export const compareCapacity = 4;

export type CompareSelection = {
  slugs: readonly string[];
  q: string;
  overflow: boolean;
};

function listed(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

/** Keep the first four valid slugs, in the order they appear in the address. */
export function parseCompareSelection(params: { ipo?: string | string[]; q?: string | string[] }): CompareSelection {
  const slugs: string[] = [];
  let overflow = false;
  for (const raw of listed(params.ipo)) {
    const slug = raw.trim();
    if (!stableIdSchema.safeParse(slug).success || slugs.includes(slug)) continue;
    if (slugs.length >= compareCapacity) {
      overflow = true;
      continue;
    }
    slugs.push(slug);
  }
  const query = listed(params.q)[0] ?? "";
  return { slugs, q: query.trim().slice(0, 80), overflow };
}

export function compareSlugKey(slugs: readonly string[]): string {
  return slugs.join(",");
}

export function comparePath(slugs: readonly string[], q = ""): string {
  const params = new URLSearchParams();
  for (const slug of slugs) params.append("ipo", slug);
  if (q) params.set("q", q);
  const text = params.toString();
  return text ? `/compare?${text}` : "/compare";
}

export function withSlug(slugs: readonly string[], slug: string): readonly string[] {
  if (!stableIdSchema.safeParse(slug).success || slugs.includes(slug) || slugs.length >= compareCapacity) return slugs;
  return [...slugs, slug];
}

export function withoutSlug(slugs: readonly string[], slug: string): string[] {
  return slugs.filter((item) => item !== slug);
}
