import { z } from "zod";
import { timestampSchema } from "./primitives.ts";

const plainText = (min: number, max: number) => z.string().trim().min(min).max(max).regex(/^[^<>\u0000-\u001F]+$/);
const slugSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const markdownBody = z.string().trim().min(1).max(50_000);

/** Public editorial categories for IPO Singh news. */
export const articleCategories = [
  "ipo-updates",
  "market-news",
  "gmp-updates",
  "allotment-updates",
  "listing-updates",
  "general",
] as const;
export const articleCategorySchema = z.enum(articleCategories);
export const articleCategoryLabel: Record<(typeof articleCategories)[number], string> = {
  "ipo-updates": "IPO Updates",
  "market-news": "Market News",
  "gmp-updates": "GMP Updates",
  "allotment-updates": "Allotment Updates",
  "listing-updates": "Listing Updates",
  general: "General",
};

export const articleStatusSchema = z.enum(["draft", "published", "archived"]);

/** HTTPS public URL without embedded credentials, or a same-origin article cover path. */
function httpsPublicUrl(value: string): boolean {
  if (!/^https:\/\//i.test(value)) return false;
  const afterScheme = value.slice("https://".length);
  const authority = afterScheme.split(/[/?#]/, 1)[0] ?? "";
  if (!authority || authority.includes("@")) return false;
  return true;
}

function articleCoverPath(value: string): boolean {
  return /^\/api\/v1\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*\/cover$/.test(value);
}

const httpsUrl = z
  .string()
  .url()
  .max(2000)
  .refine(httpsPublicUrl, "Use an https address without credentials.");

const coverUrl = z
  .string()
  .max(2000)
  .refine((value) => httpsPublicUrl(value) || articleCoverPath(value), "Use an https address or article cover path.");

export const articleCitationSchema = z
  .object({
    label: plainText(1, 160),
    url: httpsUrl,
  })
  .strict();

/** Cover images are optional. Null means no cover. */
export const articleCoverSchema = z
  .object({
    url: coverUrl,
    alt: plainText(2, 120),
  })
  .strict()
  .nullable();

export const publicArticleSummarySchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    slug: slugSchema,
    title: plainText(1, 160),
    summary: plainText(1, 400),
    category: articleCategorySchema,
    authorName: plainText(1, 80),
    sourceName: plainText(1, 120),
    publishedAt: timestampSchema,
    updatedAt: timestampSchema,
    cover: articleCoverSchema,
    evergreen: z.boolean(),
  })
  .strict();

export const publicArticleDetailSchema = publicArticleSummarySchema
  .extend({
    bodyMarkdown: markdownBody,
    relatedIpoSlugs: z.array(slugSchema).max(8),
    citations: z.array(articleCitationSchema).max(20),
  })
  .strict();

export const publicArticleListSchema = z
  .object({
    items: z.array(publicArticleSummarySchema).max(100),
    disclaimer: z.string().trim().min(1).max(500),
    /** Opaque cursor for the next page. Null when no further published articles remain. */
    nextCursor: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

export const publicArticleResponseSchema = z
  .object({
    article: publicArticleDetailSchema,
    disclaimer: z.string().trim().min(1).max(500),
  })
  .strict();

export const articleWriteSchema = z
  .object({
    title: plainText(1, 160),
    summary: plainText(1, 400),
    category: articleCategorySchema,
    authorName: plainText(1, 80),
    sourceName: plainText(1, 120),
    bodyMarkdown: markdownBody,
    relatedIpoSlugs: z.array(slugSchema).max(8),
    citations: z.array(articleCitationSchema).max(20),
    evergreen: z.boolean(),
    cover: articleCoverSchema,
    publishedAt: timestampSchema.nullable(),
    seoDescription: plainText(1, 300).optional().nullable(),
  })
  .strict();

export const adminArticleSchema = articleWriteSchema
  .extend({
    id: z.string().trim().min(1).max(80),
    slug: slugSchema,
    status: articleStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const adminArticleListSchema = z
  .object({
    articles: z.array(adminArticleSchema).max(100),
  })
  .strict();

export type ArticleCategory = z.infer<typeof articleCategorySchema>;
export type ArticleStatus = z.infer<typeof articleStatusSchema>;
export type PublicArticleSummary = z.infer<typeof publicArticleSummarySchema>;
export type PublicArticleDetail = z.infer<typeof publicArticleDetailSchema>;
export type ArticleWrite = z.infer<typeof articleWriteSchema>;
export type AdminArticle = z.infer<typeof adminArticleSchema>;

export const articleFinancialDisclaimer =
  "IPO Singh educational content is for information only. It is not investment advice, an offer, or a solicitation to buy or sell securities. Figures can be incomplete or delayed. Confirm details with official exchange and registrar sources.";
