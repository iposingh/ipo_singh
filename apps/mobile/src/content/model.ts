import {
  articleCategoryLabel,
  articleFinancialDisclaimer,
  type ArticleCategory,
  type PublicArticleDetail,
  type PublicArticleSummary,
} from "@ipo-singh/contracts";
import { formatIstDate } from "@ipo-singh/core";

export const contentDisclaimer = articleFinancialDisclaimer;

export type ContentCategoryFilter = "all" | ArticleCategory;

export const contentCategoryChoices: readonly { value: ContentCategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ipo-updates", label: articleCategoryLabel["ipo-updates"] },
  { value: "market-news", label: articleCategoryLabel["market-news"] },
  { value: "gmp-updates", label: articleCategoryLabel["gmp-updates"] },
  { value: "allotment-updates", label: articleCategoryLabel["allotment-updates"] },
  { value: "listing-updates", label: articleCategoryLabel["listing-updates"] },
  { value: "general", label: articleCategoryLabel.general },
];

export function articleCategoryText(category: ArticleCategory): string {
  return articleCategoryLabel[category];
}

export function articlePublishedLabel(publishedAt: string): string {
  return formatIstDate(publishedAt.slice(0, 10));
}

export function articleCardAccessibilityLabel(article: PublicArticleSummary): string {
  return `${article.title}. ${articleCategoryText(article.category)}. ${article.summary}. Published ${articlePublishedLabel(article.publishedAt)}. Source ${article.sourceName}.`;
}

/** Safe paragraph split. Markup is already stripped by the API; strip again as defense in depth. */
export function articleBodyParagraphs(bodyMarkdown: string): string[] {
  return bodyMarkdown
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .split(/\n{2,}/)
    .map((part) => part.replace(/\n/g, " ").trim())
    .filter(Boolean);
}

export function articlesPath(
  input: { category?: ContentCategoryFilter; q?: string; limit?: number; cursor?: string } = {},
): string {
  const params = new URLSearchParams();
  if (input.category && input.category !== "all") params.set("category", input.category);
  const query = input.q?.trim();
  if (query) params.set("q", query.slice(0, 80));
  if (typeof input.limit === "number" && Number.isFinite(input.limit)) params.set("limit", String(Math.trunc(input.limit)));
  if (input.cursor?.trim()) params.set("cursor", input.cursor.trim().slice(0, 200));
  const suffix = params.toString();
  return suffix ? `/api/v1/articles?${suffix}` : "/api/v1/articles";
}

export function articleDetailPath(slug: string): string | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return `/api/v1/articles/${slug}`;
}

/** Resolve relative article cover paths against the API origin for Image. */
export function absoluteArticleMediaUrl(origin: string, url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (!url.startsWith("/")) return null;
  try {
    return new URL(url, origin.endsWith("/") ? origin : `${origin}/`).href;
  } catch {
    return null;
  }
}

export function relatedIpoRoutes(article: PublicArticleDetail): string[] {
  return article.relatedIpoSlugs;
}
