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
  query: { category?: ArticleCategory; q?: string },
  now = new Date(),
) {
  const needle = query.q?.trim().toLowerCase() ?? "";
  const items = articles
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
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  return publicArticleListSchema.parse({
    items,
    disclaimer: articleFinancialDisclaimer,
  });
}
