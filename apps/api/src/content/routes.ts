import {
  articleCategorySchema,
  articleFinancialDisclaimer,
  publicArticleListSchema,
  publicArticleResponseSchema,
} from "@ipo-singh/contracts";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { DatabaseHandle } from "../db/handle.ts";
import { HttpError } from "../shared/errors.ts";
import { createMemoryArticleStore } from "./memory-store.ts";
import { articleIsPublic, listPublicArticles, toPublicDetail } from "./publish.ts";
import type { ArticleStore } from "./records.ts";

const fallbackStore = createMemoryArticleStore();
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function resolveStore(readDatabase: () => DatabaseHandle): ArticleStore {
  return readDatabase().articles ?? fallbackStore;
}

export function createArticleRouter(readDatabase: () => DatabaseHandle): Router {
  const router = Router();
  router.get("/", (req, res, next) => {
    void list(req, res, next, readDatabase);
  });
  router.get("/:slug", (req, res, next) => {
    void detail(req, res, next, readDatabase);
  });
  return router;
}

async function list(req: Request, res: Response, next: NextFunction, readDatabase: () => DatabaseHandle): Promise<void> {
  try {
    const categoryRaw = typeof req.query.category === "string" ? req.query.category : undefined;
    let category: ReturnType<typeof articleCategorySchema.parse> | undefined;
    if (categoryRaw) {
      const parsedCategory = articleCategorySchema.safeParse(categoryRaw);
      if (!parsedCategory.success) throw new HttpError(400, "validation_error", "That category is not valid.");
      category = parsedCategory.data;
    }
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : undefined;
    if (q !== undefined && (q.includes("<") || q.includes(">"))) {
      throw new HttpError(400, "validation_error", "That search text is not valid.");
    }
    const articles = await resolveStore(readDatabase).list();
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(listPublicArticles(articles, { category, q: q || undefined }));
  } catch (error) {
    next(error);
  }
}

async function detail(req: Request, res: Response, next: NextFunction, readDatabase: () => DatabaseHandle): Promise<void> {
  try {
    const slug = req.params.slug;
    if (typeof slug !== "string" || !slugPattern.test(slug)) {
      throw new HttpError(404, "not_found", "That article was not found.");
    }
    const article = await resolveStore(readDatabase).findBySlug(slug);
    if (!article || !articleIsPublic(article)) {
      throw new HttpError(404, "not_found", "That article was not found.");
    }
    const detailBody = toPublicDetail(article);
    if (!detailBody) throw new HttpError(404, "not_found", "That article was not found.");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(
      publicArticleResponseSchema.parse({
        article: detailBody,
        disclaimer: articleFinancialDisclaimer,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export { publicArticleListSchema };
