import { ipoSchema, ipoSummarySchema, pageSchema, type Board, type Ipo, type IpoSummary } from "@ipo-singh/contracts";
import { requestJson } from "../api/client.ts";
import { MobileApiError, apiFailureMessage } from "../api/errors.ts";
import { shareFlight } from "./flights.ts";
import { refreshIpoLifecycle, refreshSummaryLifecycle } from "./lifecycle.ts";
import { pageFailureMessage } from "./load.ts";
import { issueRequestPath } from "./routes.ts";
import {
  cachePolicies,
  cacheReadNote,
  cacheWriteNote,
  issueCacheKey,
  listCacheKey,
  readCached,
  writeCached,
  type JsonCache,
} from "./response-cache.ts";
import { listingRequestPath, type ListingSection } from "./sections.ts";

function withRefreshedSummaries(items: readonly IpoSummary[], now: Date): IpoSummary[] {
  return items.map((item) => refreshSummaryLifecycle(item, now));
}

const summaryPageSchema = pageSchema(ipoSummarySchema);

export type CatalogueRequest = {
  origin: string;
  offline: boolean;
  force?: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: Date;
};

export type CataloguePage =
  | {
      status: "ready";
      items: IpoSummary[];
      nextCursor: string | null;
      totalCount: number | null;
      source: "network" | "cache";
      cacheReason: "fresh" | "offline" | "fallback" | null;
      cacheNote: string | null;
    }
  | { status: "offline" | "unavailable"; message: string; cacheNote: string | null };

export type IssueLoad =
  | { status: "ready"; ipo: Ipo; source: "network" | "cache"; cacheReason: "fresh" | "offline" | "fallback" | null; cacheNote: string | null }
  | { status: "missing" }
  | { status: "offline" | "unavailable"; message: string; cacheNote: string | null };

type ReadyPage = Extract<CataloguePage, { status: "ready" }>;
type MemoryPage = { storedAt: number; page: ReadyPage };
type MemoryIssue = { storedAt: number; issue: Extract<IssueLoad, { status: "ready" }> };

function noteFor(readFailed: boolean, write: "saved" | "failed" | null): string | null {
  if (write === "failed") return cacheWriteNote;
  if (readFailed) return cacheReadNote;
  return null;
}

type ListPageResult =
  | { status: "ready"; items: IpoSummary[]; nextCursor: string | null; totalCount: number | null }
  | { status: "unavailable"; message: string };

async function requestPage(request: CatalogueRequest, path: string): Promise<ListPageResult> {
  try {
    const page = await requestJson({
      origin: request.origin,
      path,
      schema: summaryPageSchema,
      fetchImpl: request.fetchImpl,
      signal: request.signal,
    });
    return {
      status: "ready",
      items: page.items,
      nextCursor: page.page.nextCursor,
      totalCount: page.page.totalCount,
    };
  } catch (error) {
    if (error instanceof MobileApiError) {
      if (error.kind === "cancelled") throw error;
      return { status: "unavailable", message: error.message };
    }
    return { status: "unavailable", message: apiFailureMessage.network };
  }
}

export function createCatalogueClient(store: JsonCache) {
  const listFlights = new Map<string, Promise<CataloguePage>>();
  const issueFlights = new Map<string, Promise<IssueLoad>>();
  const memoryLists = new Map<string, MemoryPage>();
  const memoryIssues = new Map<string, MemoryIssue>();

  function rememberList(key: string, storedAt: number, page: ReadyPage) {
    memoryLists.set(key, { storedAt, page });
  }

  async function savedList(key: string, now: Date, allowStale: boolean): Promise<{ page: ReadyPage; failed: boolean } | { page: null; failed: boolean }> {
    const saved = await readCached(store, key, summaryPageSchema, now, allowStale, cachePolicies.listings);
    if (saved.hit === "miss") return { page: null, failed: saved.failed };
    const page: ReadyPage = {
      status: "ready",
      items: withRefreshedSummaries(saved.value.items, now),
      nextCursor: saved.value.page.nextCursor,
      totalCount: saved.value.page.totalCount,
      source: "cache",
      cacheReason: saved.hit === "fresh" ? "fresh" : "offline",
      cacheNote: null,
    };
    rememberList(key, saved.storedAt, page);
    return { page, failed: false };
  }

  async function fetchList(path: string, key: string, request: CatalogueRequest): Promise<CataloguePage> {
    const now = request.now ?? new Date();
    if (request.offline) {
      const saved = await savedList(key, now, true);
      if (saved.page) return { ...saved.page, cacheReason: "offline" };
      return { status: "offline", message: apiFailureMessage.offline, cacheNote: saved.failed ? cacheReadNote : null };
    }
    let readFailed = false;
    if (!request.force) {
      const saved = await savedList(key, now, false);
      readFailed = saved.failed;
      if (saved.page) return saved.page;
    }
    const page = await requestPage(request, path);
    if (page.status === "ready") {
      const items = withRefreshedSummaries(page.items, now);
      const body = {
        items: page.items,
        page: { limit: 20, nextCursor: page.nextCursor, totalCount: page.totalCount },
      };
      const write = await writeCached(store, key, body, now);
      const ready: ReadyPage = {
        status: "ready",
        items,
        nextCursor: page.nextCursor,
        totalCount: page.totalCount,
        source: "network",
        cacheReason: null,
        cacheNote: noteFor(readFailed, write),
      };
      rememberList(key, now.getTime(), ready);
      return ready;
    }
    const fallback = await savedList(key, now, true);
    if (fallback.page) return { ...fallback.page, cacheReason: "fallback", cacheNote: fallback.failed ? cacheReadNote : null };
    return { status: "unavailable", message: pageFailureMessage(page), cacheNote: readFailed || fallback.failed ? cacheReadNote : null };
  }

  function loadListing(board: Board, section: ListingSection, cursor: string | undefined, request: CatalogueRequest): Promise<CataloguePage> {
    const path = listingRequestPath(board, section, cursor);
    const key = listCacheKey(request.origin, path);
    const now = request.now ?? new Date();
    if (request.force) memoryLists.delete(key);
    if (!request.force && !request.offline) {
      const memory = memoryLists.get(key);
      if (memory && now.getTime() - memory.storedAt <= cachePolicies.listings.freshMs) return Promise.resolve(memory.page);
      return shareFlight(listFlights, key, () => fetchList(path, key, request));
    }
    return fetchList(path, key, request);
  }

  async function savedIssue(key: string, now: Date, allowStale: boolean): Promise<{ issue: Extract<IssueLoad, { status: "ready" }> | null; failed: boolean }> {
    const saved = await readCached(store, key, ipoSchema, now, allowStale, cachePolicies.issue);
    if (saved.hit === "miss") return { issue: null, failed: saved.failed };
    const issue: Extract<IssueLoad, { status: "ready" }> = {
      status: "ready",
      ipo: refreshIpoLifecycle(saved.value, now),
      source: "cache",
      cacheReason: saved.hit === "fresh" ? "fresh" : "offline",
      cacheNote: null,
    };
    memoryIssues.set(key, { storedAt: saved.storedAt, issue });
    return { issue, failed: false };
  }

  async function fetchIssue(slug: string, key: string, request: CatalogueRequest): Promise<IssueLoad> {
    const path = issueRequestPath(slug);
    if (!path) return { status: "unavailable", message: "This IPO address is not valid.", cacheNote: null };
    const now = request.now ?? new Date();
    if (request.offline) {
      const saved = await savedIssue(key, now, true);
      if (saved.issue) return { ...saved.issue, cacheReason: "offline" };
      return { status: "offline", message: apiFailureMessage.offline, cacheNote: saved.failed ? cacheReadNote : null };
    }
    let readFailed = false;
    if (!request.force) {
      const saved = await savedIssue(key, now, false);
      readFailed = saved.failed;
      if (saved.issue) return saved.issue;
    }
    try {
      const ipo = await requestJson({
        origin: request.origin,
        path,
        schema: ipoSchema,
        fetchImpl: request.fetchImpl,
        signal: request.signal,
      });
      const write = await writeCached(store, key, ipo, now);
      const ready: Extract<IssueLoad, { status: "ready" }> = {
        status: "ready",
        ipo: refreshIpoLifecycle(ipo, now),
        source: "network",
        cacheReason: null,
        cacheNote: noteFor(readFailed, write),
      };
      memoryIssues.set(key, { storedAt: now.getTime(), issue: ready });
      return ready;
    } catch (error) {
      if (error instanceof MobileApiError && error.kind === "cancelled") throw error;
      if (error instanceof MobileApiError && error.status === 404) return { status: "missing" };
      const fallback = await savedIssue(key, now, true);
      if (fallback.issue) return { ...fallback.issue, cacheReason: "fallback" };
      const message = error instanceof MobileApiError ? error.message : apiFailureMessage.network;
      return { status: "unavailable", message, cacheNote: readFailed || fallback.failed ? cacheReadNote : null };
    }
  }

  function loadIssue(slug: string, request: CatalogueRequest): Promise<IssueLoad> {
    const key = issueCacheKey(request.origin, slug);
    const now = request.now ?? new Date();
    if (request.force) memoryIssues.delete(key);
    if (!request.force && !request.offline) {
      const memory = memoryIssues.get(key);
      if (memory && now.getTime() - memory.storedAt <= cachePolicies.issue.freshMs) return Promise.resolve(memory.issue);
      return shareFlight(issueFlights, key, () => fetchIssue(slug, key, request));
    }
    return fetchIssue(slug, key, request);
  }

  return { loadListing, loadIssue };
}

export async function eachLimited<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (current === undefined) return;
      await worker(current);
    }
  });
  await Promise.all(runners);
}
