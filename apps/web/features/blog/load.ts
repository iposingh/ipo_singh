import {
  publicArticleListSchema,
  publicArticleResponseSchema,
  type PublicArticleDetail,
  type PublicArticleSummary,
} from "@ipo-singh/contracts";
import { internalServiceHeaders } from "../../lib/api/internal-headers.ts";
import { ipoSinghApiOrigin } from "../../lib/api/ipo-singh.ts";

export type BlogArticle = PublicArticleDetail;

async function fetchJson(path: string): Promise<unknown | null> {
  const origin = ipoSinghApiOrigin(process.env.IPO_SINGH_API_ORIGIN);
  if (!origin) return null;
  try {
    const response = await fetch(new URL(path, origin), {
      headers: { ...internalServiceHeaders(), accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export async function listPublishedArticles(input: { limit?: number; cursor?: string } = {}): Promise<PublicArticleSummary[]> {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(Math.max(input.limit ?? 100, 1), 100)));
  if (input.cursor?.trim()) params.set("cursor", input.cursor.trim().slice(0, 200));
  const payload = await fetchJson(`/api/v1/articles?${params.toString()}`);
  if (!payload) return [];
  const parsed = publicArticleListSchema.safeParse(payload);
  return parsed.success ? parsed.data.items : [];
}

export async function findPublishedArticle(slug: string): Promise<BlogArticle | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const payload = await fetchJson(`/api/v1/articles/${slug}`);
  if (!payload) return null;
  const parsed = publicArticleResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.article : null;
}
