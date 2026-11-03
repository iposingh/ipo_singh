import { stableIdSchema } from "@ipo-singh/contracts";
import { listPublishedArticles } from "../../features/blog/load.ts";
import { indexablePaths } from "./site.ts";

export type SitemapIssue = {
  slug: string;
  updatedAt: string | null;
};

export type SitemapEntry = {
  url: string;
  lastModified?: Date;
};

/** Stable public pages plus stored IPO detail URLs. No filters, months, or comparisons. */
export function sitemapEntries(origin: URL, issues: readonly SitemapIssue[]): SitemapEntry[] {
  const pages: SitemapEntry[] = indexablePaths.map((item) => ({
    url: new URL(item.path, origin).href,
  }));
  const articles: SitemapEntry[] = listPublishedArticles().map((article) => {
    const entry: SitemapEntry = { url: new URL(`/blog/${article.slug}`, origin).href };
    if (article.updatedAt) {
      const parsed = Date.parse(article.updatedAt);
      if (!Number.isNaN(parsed)) entry.lastModified = new Date(parsed);
    }
    return entry;
  });
  const seen = new Set<string>();
  const details: SitemapEntry[] = [];
  for (const issue of issues) {
    if (!stableIdSchema.safeParse(issue.slug).success || seen.has(issue.slug)) continue;
    seen.add(issue.slug);
    const entry: SitemapEntry = { url: new URL(`/ipos/${issue.slug}`, origin).href };
    if (issue.updatedAt) {
      const parsed = Date.parse(issue.updatedAt);
      if (!Number.isNaN(parsed)) entry.lastModified = new Date(parsed);
    }
    details.push(entry);
  }
  return [...pages, ...articles, ...details];
}
