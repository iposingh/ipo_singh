import {
  adminArticleListSchema,
  adminArticleSchema,
  articleWriteSchema,
  type AccountRole,
  type AdminAuditAction,
} from "@ipo-singh/contracts";
import express, { Router, type NextFunction, type Request, type Response } from "express";
import type { AdminAuditStore } from "../accounts/audit.ts";
import { requireRole } from "../accounts/middleware.ts";
import { createAccountId } from "../accounts/tokens.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import { HttpError } from "../shared/errors.ts";
import type { Logger } from "../shared/logger.ts";
import { articleImageLimit, inspectArticleImage } from "./images.ts";
import { createMemoryArticleStore } from "./memory-store.ts";
import type { ArticleRecord, ArticleStore } from "./records.ts";
import { sanitizeArticleMarkdown, sanitizeArticlePlain, sanitizeCitationUrl } from "./sanitize.ts";

const administrators = ["super-admin"] as const satisfies readonly AccountRole[];
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fallbackStore = createMemoryArticleStore();

export type ArticleAdminDeps = {
  readDatabase: () => DatabaseHandle;
  readAudit: () => AdminAuditStore | undefined;
  logger: Logger;
};

function resolveStore(readDatabase: () => DatabaseHandle): ArticleStore {
  return readDatabase().articles ?? fallbackStore;
}

function coverPath(slug: string): string {
  return `/api/v1/articles/${slug}/cover`;
}

function toAdmin(article: ArticleRecord) {
  return adminArticleSchema.parse({
    id: article.id,
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    category: article.category,
    status: article.status,
    authorName: article.authorName,
    sourceName: article.sourceName,
    bodyMarkdown: article.bodyMarkdown,
    relatedIpoSlugs: article.relatedIpoSlugs,
    citations: article.citations,
    evergreen: article.evergreen,
    cover: article.cover,
    seoDescription: article.seoDescription ?? null,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  });
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function recordAudit(
  deps: ArticleAdminDeps,
  actorUserId: string,
  outcome: "succeeded" | "denied",
  action: AdminAuditAction = "banner_change",
): Promise<void> {
  const audit = deps.readAudit();
  if (!audit) throw new HttpError(503, "unavailable", "Administration is temporarily unavailable.");
  await audit.insert({
    id: createAccountId(),
    actorUserId,
    action,
    outcome,
    targetUserId: null,
    createdAt: new Date(),
  });
  deps.logger.info("admin_audit", { action, outcome, actorUserId, targetUserId: null });
}

function protect(deps: ArticleAdminDeps) {
  const gate = requireRole(administrators);
  return (req: Request, res: Response, next: NextFunction): void => {
    gate(req, res, (error) => {
      if (error instanceof HttpError && error.status === 403 && req.auth?.kind === "user") {
        void recordAudit(deps, req.auth.userId, "denied", "access_denied")
          .then(() => next(error))
          .catch((auditError: unknown) => next(auditError));
        return;
      }
      next(error);
    });
  };
}

function parseWrite(body: unknown) {
  const parsed = articleWriteSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, "validation_error", "That article could not be saved.");
  return parsed.data;
}

export function createArticleAdminRouter(deps: ArticleAdminDeps): Router {
  const router = Router();
  const gate = protect(deps);
  router.get("/articles", gate, (req, res, next) => {
    void list(req, res, next, deps);
  });
  router.get("/articles/:id", gate, (req, res, next) => {
    void readOne(req, res, next, deps);
  });
  router.post("/articles", gate, (req, res, next) => {
    void create(req, res, next, deps);
  });
  router.patch("/articles/:id", gate, (req, res, next) => {
    void update(req, res, next, deps);
  });
  router.post("/articles/:id/publish", gate, (req, res, next) => {
    void setStatus(req, res, next, deps, "published");
  });
  router.post("/articles/:id/unpublish", gate, (req, res, next) => {
    void setStatus(req, res, next, deps, "draft");
  });
  router.post("/articles/:id/archive", gate, (req, res, next) => {
    void setStatus(req, res, next, deps, "archived");
  });
  router.delete("/articles/:id", gate, (req, res, next) => {
    void remove(req, res, next, deps);
  });
  router.post(
    "/articles/:id/cover",
    express.raw({
      limit: articleImageLimit,
      type: (req) => {
        const type = String(req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
        return type === "image/png" || type === "image/jpeg" || type === "image/webp";
      },
    }),
    gate,
    (req, res, next) => {
      void uploadCover(req, res, next, deps);
    },
  );
  router.delete("/articles/:id/cover", gate, (req, res, next) => {
    void removeCover(req, res, next, deps);
  });
  return router;
}

async function list(_req: Request, res: Response, next: NextFunction, deps: ArticleAdminDeps): Promise<void> {
  try {
    const articles = await resolveStore(deps.readDatabase).list();
    res.json(adminArticleListSchema.parse({ articles: articles.map(toAdmin) }));
  } catch (error) {
    next(error);
  }
}

async function readOne(req: Request, res: Response, next: NextFunction, deps: ArticleAdminDeps): Promise<void> {
  try {
    const id = req.params.id;
    if (typeof id !== "string" || !idPattern.test(id)) throw new HttpError(404, "not_found", "That article was not found.");
    const article = await resolveStore(deps.readDatabase).find(id);
    if (!article) throw new HttpError(404, "not_found", "That article was not found.");
    res.json(toAdmin(article));
  } catch (error) {
    next(error);
  }
}

async function create(req: Request, res: Response, next: NextFunction, deps: ArticleAdminDeps): Promise<void> {
  try {
    if (req.auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const parsed = parseWrite(req.body);
    const store = resolveStore(deps.readDatabase);
    const now = new Date();
    const baseSlug = slugify(parsed.title) || `article-${now.getTime()}`;
    let slug = baseSlug;
    let suffix = 2;
    while (await store.findBySlug(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const id = slug;
    if (!idPattern.test(id)) throw new HttpError(400, "validation_error", "That article title could not form a slug.");
    const citations = parsed.citations.flatMap((item) => {
      const url = sanitizeCitationUrl(item.url);
      if (!url) return [];
      return [{ label: sanitizeArticlePlain(item.label), url }];
    });
    const nextRecord: ArticleRecord = {
      id,
      slug,
      title: sanitizeArticlePlain(parsed.title),
      summary: sanitizeArticlePlain(parsed.summary),
      category: parsed.category,
      status: "draft",
      authorName: sanitizeArticlePlain(parsed.authorName),
      sourceName: sanitizeArticlePlain(parsed.sourceName),
      bodyMarkdown: sanitizeArticleMarkdown(parsed.bodyMarkdown),
      relatedIpoSlugs: parsed.relatedIpoSlugs,
      citations,
      evergreen: parsed.evergreen,
      cover: parsed.cover,
      coverImage: null,
      seoDescription: parsed.seoDescription ? sanitizeArticlePlain(parsed.seoDescription) : null,
      createdBy: req.auth.userId,
      updatedBy: req.auth.userId,
      publishedAt: parsed.publishedAt ? new Date(parsed.publishedAt) : null,
      createdAt: now,
      updatedAt: now,
    };
    await store.insert(nextRecord);
    await recordAudit(deps, req.auth.userId, "succeeded");
    res.status(201).json(toAdmin(nextRecord));
  } catch (error) {
    next(error);
  }
}

async function update(req: Request, res: Response, next: NextFunction, deps: ArticleAdminDeps): Promise<void> {
  try {
    if (req.auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const id = req.params.id;
    if (typeof id !== "string" || !idPattern.test(id)) throw new HttpError(404, "not_found", "That article was not found.");
    const parsed = parseWrite(req.body);
    const store = resolveStore(deps.readDatabase);
    const existing = await store.find(id);
    if (!existing) throw new HttpError(404, "not_found", "That article was not found.");
    const citations = parsed.citations.flatMap((item) => {
      const url = sanitizeCitationUrl(item.url);
      if (!url) return [];
      return [{ label: sanitizeArticlePlain(item.label), url }];
    });
    const nextRecord: ArticleRecord = {
      ...existing,
      title: sanitizeArticlePlain(parsed.title),
      summary: sanitizeArticlePlain(parsed.summary),
      category: parsed.category,
      authorName: sanitizeArticlePlain(parsed.authorName),
      sourceName: sanitizeArticlePlain(parsed.sourceName),
      bodyMarkdown: sanitizeArticleMarkdown(parsed.bodyMarkdown),
      relatedIpoSlugs: parsed.relatedIpoSlugs,
      citations,
      evergreen: parsed.evergreen,
      cover: parsed.cover ?? existing.cover,
      seoDescription: parsed.seoDescription ? sanitizeArticlePlain(parsed.seoDescription) : null,
      updatedBy: req.auth.userId,
      publishedAt: parsed.publishedAt ? new Date(parsed.publishedAt) : existing.publishedAt,
      updatedAt: new Date(),
    };
    await store.save(nextRecord);
    await recordAudit(deps, req.auth.userId, "succeeded");
    res.json(toAdmin(nextRecord));
  } catch (error) {
    next(error);
  }
}

async function setStatus(
  req: Request,
  res: Response,
  next: NextFunction,
  deps: ArticleAdminDeps,
  status: "published" | "draft" | "archived",
): Promise<void> {
  try {
    if (req.auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const id = req.params.id;
    if (typeof id !== "string" || !idPattern.test(id)) throw new HttpError(404, "not_found", "That article was not found.");
    const store = resolveStore(deps.readDatabase);
    const existing = await store.find(id);
    if (!existing) throw new HttpError(404, "not_found", "That article was not found.");
    const now = new Date();
    const nextRecord: ArticleRecord = {
      ...existing,
      status,
      publishedAt: status === "published" ? existing.publishedAt ?? now : existing.publishedAt,
      updatedBy: req.auth.userId,
      updatedAt: now,
    };
    await store.save(nextRecord);
    await recordAudit(deps, req.auth.userId, "succeeded");
    res.json(toAdmin(nextRecord));
  } catch (error) {
    next(error);
  }
}

async function remove(req: Request, res: Response, next: NextFunction, deps: ArticleAdminDeps): Promise<void> {
  try {
    if (req.auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const id = req.params.id;
    if (typeof id !== "string" || !idPattern.test(id)) throw new HttpError(404, "not_found", "That article was not found.");
    const store = resolveStore(deps.readDatabase);
    const existing = await store.find(id);
    if (!existing) throw new HttpError(404, "not_found", "That article was not found.");
    if (!store.remove) throw new HttpError(503, "unavailable", "Article deletion is unavailable.");
    await store.remove(id);
    await recordAudit(deps, req.auth.userId, "succeeded");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

async function uploadCover(req: Request, res: Response, next: NextFunction, deps: ArticleAdminDeps): Promise<void> {
  try {
    if (req.auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const id = req.params.id;
    if (typeof id !== "string" || !idPattern.test(id)) throw new HttpError(404, "not_found", "That article was not found.");
    const store = resolveStore(deps.readDatabase);
    const existing = await store.find(id);
    if (!existing) throw new HttpError(404, "not_found", "That article was not found.");
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const contentType = String(req.headers["content-type"] ?? "");
    const inspected = inspectArticleImage(contentType, data);
    if (!inspected) throw new HttpError(400, "validation_error", "That image could not be accepted.");
    const altRaw = typeof req.query.alt === "string" ? req.query.alt.trim() : existing.title;
    const alt = sanitizeArticlePlain(altRaw).slice(0, 120) || existing.title.slice(0, 120);
    const now = new Date();
    const nextRecord: ArticleRecord = {
      ...existing,
      cover: { url: coverPath(existing.slug), alt },
      coverImage: {
        contentType: inspected.contentType,
        width: inspected.width,
        height: inspected.height,
        byteLength: data.length,
        data,
        updatedAt: now,
      },
      updatedBy: req.auth.userId,
      updatedAt: now,
    };
    await store.save(nextRecord);
    await recordAudit(deps, req.auth.userId, "succeeded");
    res.json(toAdmin(nextRecord));
  } catch (error) {
    next(error);
  }
}

async function removeCover(req: Request, res: Response, next: NextFunction, deps: ArticleAdminDeps): Promise<void> {
  try {
    if (req.auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const id = req.params.id;
    if (typeof id !== "string" || !idPattern.test(id)) throw new HttpError(404, "not_found", "That article was not found.");
    const store = resolveStore(deps.readDatabase);
    const existing = await store.find(id);
    if (!existing) throw new HttpError(404, "not_found", "That article was not found.");
    const nextRecord: ArticleRecord = {
      ...existing,
      cover: null,
      coverImage: null,
      updatedBy: req.auth.userId,
      updatedAt: new Date(),
    };
    await store.save(nextRecord);
    await recordAudit(deps, req.auth.userId, "succeeded");
    res.json(toAdmin(nextRecord));
  } catch (error) {
    next(error);
  }
}
