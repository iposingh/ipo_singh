import {
  adminArticleListSchema,
  adminArticleSchema,
  articleWriteSchema,
  type AccountRole,
  type AdminAuditAction,
} from "@ipo-singh/contracts";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { AdminAuditStore } from "../accounts/audit.ts";
import { requireRole } from "../accounts/middleware.ts";
import { createAccountId } from "../accounts/tokens.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import { HttpError } from "../shared/errors.ts";
import type { Logger } from "../shared/logger.ts";
import { createMemoryArticleStore } from "./memory-store.ts";
import type { ArticleRecord, ArticleStore } from "./records.ts";
import { sanitizeArticleMarkdown, sanitizeArticlePlain, sanitizeCitationUrl } from "./sanitize.ts";

const administrators = ["admin", "super-admin"] as const satisfies readonly AccountRole[];
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

export function createArticleAdminRouter(deps: ArticleAdminDeps): Router {
  const router = Router();
  // Protect per route so unknown /api/v1/admin/* paths still 404 (not 403).
  const gate = protect(deps);
  router.get("/articles", gate, (req, res, next) => {
    void list(req, res, next, deps);
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
  router.post("/articles/:id/archive", gate, (req, res, next) => {
    void setStatus(req, res, next, deps, "archived");
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

async function create(req: Request, res: Response, next: NextFunction, deps: ArticleAdminDeps): Promise<void> {
  try {
    if (req.auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const parsed = articleWriteSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "validation_error", "That article could not be saved.");
    const store = resolveStore(deps.readDatabase);
    const now = new Date();
    const baseSlug = slugify(parsed.data.title) || `article-${now.getTime()}`;
    let slug = baseSlug;
    let suffix = 2;
    while (await store.findBySlug(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const id = slug;
    if (!idPattern.test(id)) throw new HttpError(400, "validation_error", "That article title could not form a slug.");
    const citations = parsed.data.citations.flatMap((item) => {
      const url = sanitizeCitationUrl(item.url);
      if (!url) return [];
      return [{ label: sanitizeArticlePlain(item.label), url }];
    });
    const nextRecord: ArticleRecord = {
      id,
      slug,
      title: sanitizeArticlePlain(parsed.data.title),
      summary: sanitizeArticlePlain(parsed.data.summary),
      category: parsed.data.category,
      status: "draft",
      authorName: sanitizeArticlePlain(parsed.data.authorName),
      sourceName: sanitizeArticlePlain(parsed.data.sourceName),
      bodyMarkdown: sanitizeArticleMarkdown(parsed.data.bodyMarkdown),
      relatedIpoSlugs: parsed.data.relatedIpoSlugs,
      citations,
      evergreen: parsed.data.evergreen,
      cover: parsed.data.cover,
      publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : null,
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
    const parsed = articleWriteSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "validation_error", "That article could not be saved.");
    const store = resolveStore(deps.readDatabase);
    const existing = await store.find(id);
    if (!existing) throw new HttpError(404, "not_found", "That article was not found.");
    const citations = parsed.data.citations.flatMap((item) => {
      const url = sanitizeCitationUrl(item.url);
      if (!url) return [];
      return [{ label: sanitizeArticlePlain(item.label), url }];
    });
    const nextRecord: ArticleRecord = {
      ...existing,
      title: sanitizeArticlePlain(parsed.data.title),
      summary: sanitizeArticlePlain(parsed.data.summary),
      category: parsed.data.category,
      authorName: sanitizeArticlePlain(parsed.data.authorName),
      sourceName: sanitizeArticlePlain(parsed.data.sourceName),
      bodyMarkdown: sanitizeArticleMarkdown(parsed.data.bodyMarkdown),
      relatedIpoSlugs: parsed.data.relatedIpoSlugs,
      citations,
      evergreen: parsed.data.evergreen,
      cover: parsed.data.cover,
      publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : existing.publishedAt,
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
  status: "published" | "archived",
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
      updatedAt: now,
    };
    await store.save(nextRecord);
    await recordAudit(deps, req.auth.userId, "succeeded");
    res.json(toAdmin(nextRecord));
  } catch (error) {
    next(error);
  }
}
