import type { ArticleCategory, ArticleStatus } from "@ipo-singh/contracts";

export type ArticleCitation = {
  label: string;
  url: string;
};

export type ArticleCover = {
  url: string;
  alt: string;
} | null;

export type ArticleCoverImage = {
  contentType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  byteLength: number;
  data: Buffer;
  updatedAt: Date;
} | null;

export type ArticleRecord = {
  id: string;
  slug: string;
  headline?: string;
  title: string;
  summary: string;
  category: ArticleCategory;
  status: ArticleStatus;
  authorName: string;
  sourceName: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  bodyMarkdown: string;
  relatedIpoSlugs: string[];
  citations: ArticleCitation[];
  evergreen: boolean;
  cover: ArticleCover;
  coverImage?: ArticleCoverImage;
  seoDescription?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
};

export type ArticleStore = {
  list(): Promise<ArticleRecord[]>;
  findBySlug(slug: string): Promise<ArticleRecord | null>;
  find(id: string): Promise<ArticleRecord | null>;
  insert(record: ArticleRecord): Promise<void>;
  save(record: ArticleRecord): Promise<void>;
  remove?(id: string): Promise<void>;
};
