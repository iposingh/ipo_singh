import { z } from "zod";
import { timestampSchema } from "./primitives.ts";

const plainText = (min: number, max: number) => z.string().trim().min(min).max(max).regex(/^[^<>\u0000-\u001F]+$/);
const slugSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const markdownBody = z.string().trim().min(1).max(50_000);

/** Public editorial categories for IPO Singh content. */
export const articleCategories = ["ipo-news", "guides", "market-education", "ipo-updates"] as const;
export const articleCategorySchema = z.enum(articleCategories);
export const articleCategoryLabel: Record<(typeof articleCategories)[number], string> = {
  "ipo-news": "IPO News",
  guides: "Guides",
  "market-education": "Market Education",
  "ipo-updates": "IPO Updates",
};

export const articleStatusSchema = z.enum(["draft", "published", "archived"]);

/** HTTPS public URL without embedded credentials. Avoids DOM/Node URL globals in contracts. */
function httpsPublicUrl(value: string): boolean {
  if (!/^https:\/\//i.test(value)) return false;
  const afterScheme = value.slice("https://".length);
  const authority = afterScheme.split(/[/?#]/, 1)[0] ?? "";
  if (!authority || authority.includes("@")) return false;
  return true;
}

const httpsUrl = z
  .string()
  .url()
  .max(2000)
  .refine(httpsPublicUrl, "Use an https address without credentials.");

export const articleCitationSchema = z
  .object({
    label: plainText(1, 160),
    url: httpsUrl,
  })
  .strict();

/** Cover images are optional HTTPS media addresses. Null means no cover. */
export const articleCoverSchema = z
  .object({
    url: httpsUrl,
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
