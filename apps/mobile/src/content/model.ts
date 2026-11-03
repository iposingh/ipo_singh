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
  { value: "ipo-news", label: articleCategoryLabel["ipo-news"] },
  { value: "guides", label: articleCategoryLabel.guides },
  { value: "market-education", label: articleCategoryLabel["market-education"] },
  { value: "ipo-updates", label: articleCategoryLabel["ipo-updates"] },
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

export function articlesPath(input: { category?: ContentCategoryFilter; q?: string } = {}): string {
  const params = new URLSearchParams();
  if (input.category && input.category !== "all") params.set("category", input.category);
  const query = input.q?.trim();
  if (query) params.set("q", query.slice(0, 80));
  const suffix = params.toString();
  return suffix ? `/api/v1/articles?${suffix}` : "/api/v1/articles";
}

export function articleDetailPath(slug: string): string | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return `/api/v1/articles/${slug}`;
}

export function relatedIpoRoutes(article: PublicArticleDetail): string[] {
  return article.relatedIpoSlugs;
}
