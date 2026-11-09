import {
  articleFinancialDisclaimer,
  publicArticleDetailSchema,
  publicArticleListSchema,
  publicArticleSummarySchema,
  type ArticleCategory,
  type PublicArticleDetail,
  type PublicArticleSummary,
} from "@ipo-singh/contracts";
import type { ArticleRecord } from "./records.ts";
import { sanitizeArticleMarkdown, sanitizeArticlePlain, sanitizeCitationUrl } from "./sanitize.ts";

export function articleIsPublic(article: ArticleRecord, now = new Date()): boolean {
  if (article.status !== "published" || !article.publishedAt) return false;
  return article.publishedAt.getTime() <= now.getTime();
}

export function toPublicSummary(article: ArticleRecord): PublicArticleSummary | null {
  if (!article.publishedAt) return null;
  return publicArticleSummarySchema.parse({
    id: article.id,
    slug: article.slug,
    title: sanitizeArticlePlain(article.title),
    summary: sanitizeArticlePlain(article.summary),
    category: article.category,
    authorName: sanitizeArticlePlain(article.authorName),
    sourceName: sanitizeArticlePlain(article.sourceName),
    publishedAt: article.publishedAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
    cover: article.cover
      ? {
          url: article.cover.url,
          alt: sanitizeArticlePlain(article.cover.alt),
        }
      : null,
    evergreen: article.evergreen,
  });
}

export function toPublicDetail(article: ArticleRecord): PublicArticleDetail | null {
  const summary = toPublicSummary(article);
  if (!summary) return null;
  const citations = article.citations.flatMap((item) => {
    const url = sanitizeCitationUrl(item.url);
    if (!url) return [];
    return [{ label: sanitizeArticlePlain(item.label), url }];
  });
  return publicArticleDetailSchema.parse({
    ...summary,
    bodyMarkdown: sanitizeArticleMarkdown(article.bodyMarkdown),
    relatedIpoSlugs: article.relatedIpoSlugs,
    citations,
  });
}

export function listPublicArticles(
  articles: readonly ArticleRecord[],
  query: { category?: ArticleCategory; q?: string; limit?: number; cursor?: string | null },
  now = new Date(),
) {
  const needle = query.q?.trim().toLowerCase() ?? "";
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const cursor = query.cursor?.trim() || null;
  const sorted = articles
    .filter((article) => articleIsPublic(article, now))
    .filter((article) => (query.category ? article.category === query.category : true))
    .filter((article) => {
      if (!needle) return true;
      return (
        article.title.toLowerCase().includes(needle) ||
        article.summary.toLowerCase().includes(needle) ||
        article.sourceName.toLowerCase().includes(needle)
      );
    })
    .map((article) => toPublicSummary(article))
    .filter((item): item is PublicArticleSummary => item !== null)
    .sort((left, right) => {
      const byDate = right.publishedAt.localeCompare(left.publishedAt);
      return byDate !== 0 ? byDate : left.id.localeCompare(right.id);
    });
  const start = cursor
    ? sorted.findIndex((item) => `${item.publishedAt}|${item.id}` === cursor) + 1
    : 0;
  const pageStart = start < 0 ? sorted.length : start;
  const page = sorted.slice(pageStart, pageStart + limit);
  const last = page[page.length - 1];
  const nextCursor =
    last && pageStart + page.length < sorted.length ? `${last.publishedAt}|${last.id}` : null;
  return publicArticleListSchema.parse({
    items: page,
    disclaimer: articleFinancialDisclaimer,
    nextCursor,
  });
}
