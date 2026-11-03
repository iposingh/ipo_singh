import { blogArticleSchema, seedBlogArticles, type BlogArticle } from "./schema.ts";

export function listPublishedArticles(): BlogArticle[] {
  return seedBlogArticles
    .map((article) => blogArticleSchema.parse(article))
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

export function findPublishedArticle(slug: string): BlogArticle | null {
  const article = listPublishedArticles().find((item) => item.slug === slug);
  return article ?? null;
}
