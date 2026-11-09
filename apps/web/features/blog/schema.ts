import {
  articleCategories,
  articleCategoryLabel as sharedCategoryLabel,
  articleFinancialDisclaimer,
  publicArticleDetailSchema,
  type ArticleCategory,
  type PublicArticleDetail,
} from "@ipo-singh/contracts";

export const blogCategories = articleCategories;
export const blogCategoryLabel: Record<ArticleCategory, string> = sharedCategoryLabel;

export const blogArticleSchema = publicArticleDetailSchema;
export type BlogArticle = PublicArticleDetail;

export const blogDisclaimer = articleFinancialDisclaimer;
