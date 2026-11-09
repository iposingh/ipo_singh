import { ArticleModel } from "../db/models/article.ts";
import type { ArticleCover, ArticleRecord, ArticleStore } from "./records.ts";

type CoverImageDoc = {
  contentType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  byteLength: number;
  data: Buffer;
  updatedAt: Date;
};

function imageBytes(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.alloc(0);
}

function mapCover(cover: unknown): ArticleCover {
  if (!cover || typeof cover !== "object") return null;
  const row = cover as { url?: unknown; alt?: unknown };
  if (typeof row.url !== "string" || typeof row.alt !== "string") return null;
  return { url: row.url, alt: row.alt };
}

function mapDoc(doc: Record<string, unknown>): ArticleRecord {
  const coverImageRaw = doc.coverImage;
  let coverImage: ArticleRecord["coverImage"] = null;
  if (coverImageRaw && typeof coverImageRaw === "object") {
    const image = coverImageRaw as CoverImageDoc;
    const data = imageBytes(image.data);
    if (data.length > 0 && typeof image.contentType === "string") {
      coverImage = {
        contentType: image.contentType as CoverImageDoc["contentType"],
        width: Number(image.width) || 1,
        height: Number(image.height) || 1,
        byteLength: Number(image.byteLength) || data.length,
        data,
        updatedAt: image.updatedAt instanceof Date ? image.updatedAt : new Date(),
      };
    }
  }
  return {
    id: String(doc._id),
    slug: String(doc.slug),
    title: String(doc.title),
    summary: String(doc.summary),
    category: doc.category as ArticleRecord["category"],
    status: doc.status as ArticleRecord["status"],
    authorName: String(doc.authorName),
    sourceName: String(doc.sourceName),
    publishedAt: doc.publishedAt instanceof Date ? doc.publishedAt : null,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt : new Date(),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt : new Date(),
    bodyMarkdown: String(doc.bodyMarkdown),
    relatedIpoSlugs: Array.isArray(doc.relatedIpoSlugs) ? doc.relatedIpoSlugs.map(String) : [],
    citations: Array.isArray(doc.citations)
      ? doc.citations.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const row = item as { label?: unknown; url?: unknown };
          if (typeof row.label !== "string" || typeof row.url !== "string") return [];
          return [{ label: row.label, url: row.url }];
        })
      : [],
    evergreen: doc.evergreen === true,
    cover: mapCover(doc.cover),
    coverImage,
    seoDescription: typeof doc.seoDescription === "string" ? doc.seoDescription : null,
    createdBy: typeof doc.createdBy === "string" ? doc.createdBy : null,
    updatedBy: typeof doc.updatedBy === "string" ? doc.updatedBy : null,
  };
}

function toSet(record: ArticleRecord): Record<string, unknown> {
  return {
    slug: record.slug,
    title: record.title,
    summary: record.summary,
    category: record.category,
    status: record.status,
    authorName: record.authorName,
    sourceName: record.sourceName,
    publishedAt: record.publishedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    bodyMarkdown: record.bodyMarkdown,
    relatedIpoSlugs: record.relatedIpoSlugs,
    citations: record.citations,
    evergreen: record.evergreen,
    cover: record.cover,
    coverImage: record.coverImage
      ? {
          contentType: record.coverImage.contentType,
          width: record.coverImage.width,
          height: record.coverImage.height,
          byteLength: record.coverImage.byteLength,
          data: record.coverImage.data,
          updatedAt: record.coverImage.updatedAt,
        }
      : null,
    seoDescription: record.seoDescription ?? null,
    createdBy: record.createdBy ?? null,
    updatedBy: record.updatedBy ?? null,
  };
}

export function createMongoArticleStore(): ArticleStore {
  return {
    async list() {
      const docs = await ArticleModel.find({}).sort({ publishedAt: -1, updatedAt: -1 }).lean();
      return docs.map((doc) => mapDoc(doc as Record<string, unknown>));
    },
    async findBySlug(slug) {
      const doc = await ArticleModel.findOne({ slug }).lean();
      return doc ? mapDoc(doc as Record<string, unknown>) : null;
    },
    async find(id) {
      const doc = await ArticleModel.findById(id).lean();
      return doc ? mapDoc(doc as Record<string, unknown>) : null;
    },
    async insert(record) {
      await ArticleModel.create({ _id: record.id, ...toSet(record) });
    },
    async save(record) {
      await ArticleModel.findByIdAndUpdate(record.id, { $set: toSet(record) }, { upsert: true, runValidators: true });
    },
    async remove(id) {
      await ArticleModel.findByIdAndDelete(id);
    },
  };
}
