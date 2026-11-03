import {
  publicArticleListSchema,
  publicArticleResponseSchema,
  type PublicArticleDetail,
  type PublicArticleSummary,
} from "@ipo-singh/contracts";
import { requestJson } from "../api/client.ts";
import { MobileApiError } from "../api/errors.ts";
import { shareFlight } from "../catalogue/flights.ts";
import { cachePolicies, readCached, writeCached, type JsonCache } from "../catalogue/response-cache.ts";
import { articleDetailPath, articlesPath, contentDisclaimer, type ContentCategoryFilter } from "./model.ts";

export const articleOfflineNote = "This device is offline. Showing the last saved articles.";
export const articleRefreshNote = "Articles could not be refreshed. Showing the last saved articles — not a live update.";

export type ArticleListLoad =
  | { status: "ready"; items: PublicArticleSummary[]; disclaimer: string; notice: string | null }
  | { status: "unavailable"; message: string; notice: string | null };

export type ArticleDetailLoad =
  | { status: "ready"; article: PublicArticleDetail; disclaimer: string; notice: string | null }
  | { status: "unavailable"; message: string; notice: string | null };

const articleListFlights = new Map<string, Promise<ArticleListLoad>>();
const articleDetailFlights = new Map<string, Promise<ArticleDetailLoad>>();

export function articleListCacheKey(origin: string, category: ContentCategoryFilter, q: string): string {
  return `ipo-singh.articles.${encodeURIComponent(origin)}.${category}.${encodeURIComponent(q)}`;
}

export function articleDetailCacheKey(origin: string, slug: string): string {
  return `ipo-singh.article.${encodeURIComponent(origin)}.${slug}`;
}

export async function loadArticleList(input: {
  origin: string;
  offline: boolean;
  force?: boolean;
  cache: JsonCache;
  now: Date;
  category?: ContentCategoryFilter;
  q?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<ArticleListLoad> {
  const category = input.category ?? "all";
  const q = input.q?.trim() ?? "";
  const key = articleListCacheKey(input.origin, category, q);
  if (input.force || input.offline) return fetchArticleList(input, key, category, q);
  return shareFlight(articleListFlights, key, () => fetchArticleList(input, key, category, q));
}

async function fetchArticleList(
  input: {
    origin: string;
    offline: boolean;
    force?: boolean;
    cache: JsonCache;
    now: Date;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  },
  key: string,
  category: ContentCategoryFilter,
  q: string,
): Promise<ArticleListLoad> {
  const cached = await readCached(input.cache, key, publicArticleListSchema, input.now, true, cachePolicies.articles);
  if (input.offline) {
    if (cached.hit === "miss") return { status: "unavailable", message: "No saved articles are available offline.", notice: null };
    return { status: "ready", items: cached.value.items, disclaimer: cached.value.disclaimer, notice: articleOfflineNote };
  }
  if (!input.force && cached.hit === "fresh") {
    return { status: "ready", items: cached.value.items, disclaimer: cached.value.disclaimer, notice: null };
  }
  try {
    const response = await requestJson({
      origin: input.origin,
      path: articlesPath({ category, q: q || undefined }),
      schema: publicArticleListSchema,
      fetchImpl: input.fetchImpl,
      signal: input.signal,
    });
    await writeCached(input.cache, key, response, input.now);
    return { status: "ready", items: response.items, disclaimer: response.disclaimer, notice: null };
  } catch (error) {
    if (error instanceof MobileApiError && error.kind === "cancelled") throw error;
    if (cached.hit !== "miss") {
      return { status: "ready", items: cached.value.items, disclaimer: cached.value.disclaimer, notice: articleRefreshNote };
    }
    return { status: "unavailable", message: "Articles could not be loaded.", notice: null };
  }
}

export async function loadArticleDetail(input: {
  origin: string;
  slug: string;
  offline: boolean;
  force?: boolean;
  cache: JsonCache;
  now: Date;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<ArticleDetailLoad> {
  const path = articleDetailPath(input.slug);
  if (!path) return { status: "unavailable", message: "That article address is not valid.", notice: null };
  const key = articleDetailCacheKey(input.origin, input.slug);
  if (input.force || input.offline) return fetchArticleDetail(input, key, path);
  return shareFlight(articleDetailFlights, key, () => fetchArticleDetail(input, key, path));
}

async function fetchArticleDetail(
  input: {
    origin: string;
    offline: boolean;
    force?: boolean;
    cache: JsonCache;
    now: Date;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  },
  key: string,
  path: string,
): Promise<ArticleDetailLoad> {
  const cached = await readCached(input.cache, key, publicArticleResponseSchema, input.now, true, cachePolicies.articles);
  if (input.offline) {
    if (cached.hit === "miss") return { status: "unavailable", message: "This article is not available offline.", notice: null };
    return {
      status: "ready",
      article: cached.value.article,
      disclaimer: cached.value.disclaimer,
      notice: articleOfflineNote,
    };
  }
  if (!input.force && cached.hit === "fresh") {
    return {
      status: "ready",
      article: cached.value.article,
      disclaimer: cached.value.disclaimer,
      notice: null,
    };
  }
  try {
    const response = await requestJson({
      origin: input.origin,
      path,
      schema: publicArticleResponseSchema,
      fetchImpl: input.fetchImpl,
      signal: input.signal,
    });
    await writeCached(input.cache, key, response, input.now);
    return { status: "ready", article: response.article, disclaimer: response.disclaimer, notice: null };
  } catch (error) {
    if (error instanceof MobileApiError && error.kind === "cancelled") throw error;
    if (cached.hit !== "miss") {
      return {
        status: "ready",
        article: cached.value.article,
        disclaimer: cached.value.disclaimer,
        notice: articleRefreshNote,
      };
    }
    return { status: "unavailable", message: "That article could not be loaded.", notice: null };
  }
}

export function emptyArticlesDisclaimer(): string {
  return contentDisclaimer;
}
