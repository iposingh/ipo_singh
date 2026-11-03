import type { ArticleRecord, ArticleStore } from "./records.ts";
import { seedArticleRecords } from "./seed.ts";

export function createMemoryArticleStore(seed: readonly ArticleRecord[] = seedArticleRecords()): ArticleStore {
  const articles = new Map<string, ArticleRecord>();
  for (const article of seed) {
    articles.set(article.id, { ...article, relatedIpoSlugs: [...article.relatedIpoSlugs], citations: article.citations.map((item) => ({ ...item })) });
  }

  return {
    async list() {
      return [...articles.values()].sort((left, right) => {
        const leftAt = left.publishedAt?.getTime() ?? left.updatedAt.getTime();
        const rightAt = right.publishedAt?.getTime() ?? right.updatedAt.getTime();
        return rightAt - leftAt;
      });
    },
    async findBySlug(slug) {
      for (const article of articles.values()) {
        if (article.slug === slug) return clone(article);
      }
      return null;
    },
    async find(id) {
      const article = articles.get(id);
      return article ? clone(article) : null;
    },
    async insert(record) {
      articles.set(record.id, clone(record));
    },
    async save(record) {
      articles.set(record.id, clone(record));
    },
  };
}

function clone(article: ArticleRecord): ArticleRecord {
  return {
    ...article,
    relatedIpoSlugs: [...article.relatedIpoSlugs],
    citations: article.citations.map((item) => ({ ...item })),
    cover: article.cover ? { ...article.cover } : null,
    publishedAt: article.publishedAt ? new Date(article.publishedAt) : null,
    createdAt: new Date(article.createdAt),
    updatedAt: new Date(article.updatedAt),
  };
}
