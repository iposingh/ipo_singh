import { isIsoDate } from "@ipo-singh/core";
import {
  calendarEntrySchema,
  gmpHistoryResponseSchema,
  ipoSchema,
  ipoSummarySchema,
  pageSchema,
  stableIdSchema,
  subscriptionHistoryResponseSchema,
  type Board,
  type CalendarEntry,
  type Ipo,
  type IpoStatus,
  type IpoSummary,
} from "@ipo-singh/contracts";
import { internalServiceHeaders } from "./internal-headers.ts";

const listPageSchema = pageSchema(ipoSummarySchema);
const calendarPageSchema = pageSchema(calendarEntrySchema);
const pageLimit = 100;
const searchPageLimit = 20;
const maxPages = 10;
const maxSearchPages = 5;
const minimumSearchLength = 2;

export type CatalogDeps = {
  origin?: string;
  fetch?: typeof fetch;
};

export type CatalogResult = {
  status: "ready" | "unavailable";
  ipos: readonly Ipo[];
};

export type SearchCatalogQuery = {
  q: string;
  board?: Board;
  status?: IpoStatus;
  from?: string;
  to?: string;
  cursor?: string;
};

export type SearchCatalogResult =
  | { status: "ready"; ipos: readonly Ipo[]; truncated: boolean; nextCursor: string | null; totalCount: number | null }
  | { status: "short" }
  | { status: "invalid" }
  | { status: "unavailable" };

export type CalendarCatalogResult =
  | { status: "ready"; entries: readonly CalendarEntry[]; truncated: boolean }
  | { status: "unavailable" };

export type ListedCatalogResult =
  | { status: "ready"; ipos: readonly Ipo[]; truncated: boolean }
  | { status: "unavailable" };

export type SitemapIssue = {
  slug: string;
  updatedAt: string | null;
};

export type SitemapCatalogResult =
  | { status: "ready"; issues: readonly SitemapIssue[]; truncated: boolean }
  | { status: "unavailable" };

export type SearchSummaryResult =
  | { status: "ready"; items: readonly IpoSummary[]; truncated: boolean }
  | { status: "short" }
  | { status: "invalid" }
  | { status: "unavailable" };

export type SearchSummaryOptions = {
  limit?: number;
  maxPages?: number;
  board?: Board;
  status?: IpoStatus;
  from?: string;
  to?: string;
};

export type CompareDocument = Ipo | null;

export type CompareDocumentsResult =
  | { status: "ready"; ipos: readonly CompareDocument[] }
  | { status: "unavailable" };

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".localhost");
}

/** Temporary public tunnels must not become the production or preview website API origin. */
export function isEphemeralApiTunnelHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.endsWith(".trycloudflare.com") ||
    host.endsWith(".cfargotunnel.com") ||
    host.endsWith(".loca.lt") ||
    host.endsWith(".ngrok.io") ||
    host.endsWith(".ngrok-free.app") ||
    host.endsWith(".ngrok.app") ||
    host.endsWith(".serveo.net")
  );
}

/**
 * IPO Singh API origin. Vendor hosts are refused before any request is made.
 * Production requires an explicit https origin (no localhost default, no ephemeral tunnels).
 */
export function ipoSinghApiOrigin(value: string | undefined, nodeEnv = process.env.NODE_ENV): URL | null {
  const production = nodeEnv === "production";
  const trimmed = value?.trim() ?? "";
  const raw = trimmed || (production ? "" : "http://127.0.0.1:4000");
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username !== "" || url.password !== "") return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (url.search !== "" || url.hash !== "") return null;
  if (host === "ipoguru.in" || host.endsWith(".ipoguru.in")) return null;
  if (production) {
    if (url.protocol !== "https:") return null;
    if (isLoopbackHost(host) || isEphemeralApiTunnelHost(host)) return null;
  }
  return url;
}

export async function loadBoardCatalog(board: Board, deps: CatalogDeps = {}): Promise<CatalogResult> {
  const origin = ipoSinghApiOrigin(deps.origin);
  if (!origin) return { status: "unavailable", ipos: [] };
  const slugs: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ board, limit: String(pageLimit) });
    if (cursor) params.set("cursor", cursor);
    const body = await readJson(origin, `/api/v1/ipos?${params.toString()}`, deps.fetch);
    const parsed = listPageSchema.safeParse(body);
    if (!parsed.success) return { status: "unavailable", ipos: [] };
    for (const item of parsed.data.items) {
      if (item.board === board && stableIdSchema.safeParse(item.slug).success) slugs.push(item.slug);
    }
    cursor = parsed.data.page.nextCursor;
    if (!cursor) break;
  }
  return hydrate(origin, slugs, deps.fetch);
}

export const listingPageLimit = 20;

export type ListingLoadStatus = "ready" | "backend" | "database" | "rate_limited" | "unexpected";

export type ListingQuery = {
  board: Board;
  status?: IpoStatus;
  q?: string;
  sort?: "open" | "close" | "listing";
  direction?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export type ListingPageResult = {
  status: ListingLoadStatus;
  items: readonly IpoSummary[];
  totalCount: number | null;
};

/** One catalogue page. Detail documents are not requested. */
export async function loadListingSummaries(query: ListingQuery, deps: CatalogDeps = {}): Promise<ListingPageResult> {
  const origin = ipoSinghApiOrigin(deps.origin);
  if (!origin) return { status: "backend", items: [], totalCount: null };
  const limit = query.limit ?? listingPageLimit;
  const page = query.page ?? 1;
  const params = new URLSearchParams({ board: query.board, limit: String(limit) });
  if (query.status) params.set("status", query.status);
  if (query.q) params.set("q", query.q);
  if (query.sort) params.set("sort", query.sort);
  if (query.direction) params.set("direction", query.direction);
  const cursor = page > 1 ? Buffer.from(String((page - 1) * limit), "utf8").toString("base64url") : null;
  if (cursor) params.set("cursor", cursor);
  const response = await readResponse(origin, `/api/v1/ipos?${params.toString()}`, deps.fetch, 12_000);
  if (response.status !== 200) return { status: listingFailure(response.status), items: [], totalCount: null };
  const parsed = parseListingItems(response.body, query.board);
  if (!parsed) return { status: "unexpected", items: [], totalCount: null };
  return { status: "ready", items: parsed.items, totalCount: parsed.totalCount };
}

function listingFailure(status: number): ListingLoadStatus {
  if (status === 0) return "backend";
  if (status === 503) return "database";
  if (status === 429) return "rate_limited";
  return "unexpected";
}

function parseListingItems(body: unknown, board: Board): { items: IpoSummary[]; totalCount: number | null } | null {
  if (!body || typeof body !== "object" || !("items" in body) || !Array.isArray(body.items)) return null;
  const items: IpoSummary[] = [];
  for (const item of body.items) {
    const parsed = ipoSummarySchema.safeParse(item);
    if (parsed.success && parsed.data.board === board) items.push(parsed.data);
  }
  if (body.items.length > 0 && items.length === 0) return null;
  const page = "page" in body && body.page && typeof body.page === "object" ? body.page : null;
  const total = page && "totalCount" in page ? page.totalCount : null;
  return { items, totalCount: typeof total === "number" && Number.isSafeInteger(total) && total >= 0 ? total : null };
}

function cleanSearchText(value: string): { text: string; rejected: boolean } {
  const trimmed = value.trim();
  if (trimmed.includes("<") || trimmed.includes(">")) return { text: "", rejected: true };
  for (const character of trimmed) {
    if ((character.codePointAt(0) ?? 0) <= 31) return { text: "", rejected: true };
  }
  return { text: trimmed.slice(0, 80), rejected: false };
}

function searchDates(from?: string, to?: string): "ok" | "invalid" {
  if (from !== undefined && !isIsoDate(from)) return "invalid";
  if (to !== undefined && !isIsoDate(to)) return "invalid";
  if (from && to && from > to) return "invalid";
  return "ok";
}

function searchParams(query: SearchCatalogQuery, limit: number, cursor?: string): URLSearchParams {
  const params = new URLSearchParams({ q: query.q, limit: String(limit) });
  if (query.board) params.set("board", query.board);
  if (query.status) params.set("status", query.status);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (cursor) params.set("cursor", cursor);
  return params;
}

async function readSearchPage(
  origin: URL,
  params: URLSearchParams,
  fetchImpl: typeof fetch | undefined,
): Promise<
  | { status: "ready"; items: IpoSummary[]; nextCursor: string | null; totalCount: number | null }
  | { status: "invalid" }
  | { status: "unavailable" }
> {
  const response = await readResponse(origin, `/api/v1/search?${params.toString()}`, fetchImpl);
  if (response.status === 400) return { status: "invalid" };
  if (response.status !== 200) return { status: "unavailable" };
  const parsed = listPageSchema.safeParse(response.body);
  if (!parsed.success) return { status: "unavailable" };
  return {
    status: "ready",
    items: parsed.data.items.filter((item) => stableIdSchema.safeParse(item.slug).success),
    nextCursor: parsed.data.page.nextCursor,
    totalCount: parsed.data.page.totalCount,
  };
}

function prepareSearch(
  query: string | SearchCatalogQuery,
): { ok: true; query: SearchCatalogQuery } | { ok: false; status: "short" | "invalid" } {
  const request = typeof query === "string" ? { q: query } : query;
  const text = cleanSearchText(request.q);
  if (text.rejected) return { ok: false, status: "invalid" };
  if (text.text.length < minimumSearchLength) return { ok: false, status: "short" };
  if (searchDates(request.from, request.to) === "invalid") return { ok: false, status: "invalid" };
  return { ok: true, query: { ...request, q: text.text } };
}

/** One stored page. A short query, disallowed text, or an inverted date range is not sent. */
export async function loadSearchCatalog(query: string | SearchCatalogQuery, deps: CatalogDeps = {}): Promise<SearchCatalogResult> {
  const prepared = prepareSearch(query);
  if (!prepared.ok) return { status: prepared.status };
  const origin = ipoSinghApiOrigin(deps.origin);
  if (!origin) return { status: "unavailable" };
  const page = await readSearchPage(origin, searchParams(prepared.query, searchPageLimit, prepared.query.cursor), deps.fetch);
  if (page.status !== "ready") return page;
  const hydrated = await hydrate(origin, page.items.map((item) => item.slug), deps.fetch);
  if (hydrated.status !== "ready") return { status: "unavailable" };
  return {
    status: "ready",
    ipos: hydrated.ipos,
    truncated: page.nextCursor !== null,
    nextCursor: page.nextCursor,
    totalCount: page.totalCount,
  };
}

/** Search names for a picker. Summaries are enough, so matching issues are not loaded again. */
export async function loadSearchSummaries(
  query: string,
  deps: CatalogDeps = {},
  options: SearchSummaryOptions = {},
): Promise<SearchSummaryResult> {
  const prepared = prepareSearch({
    q: query,
    board: options.board,
    status: options.status,
    from: options.from,
    to: options.to,
  });
  if (!prepared.ok) return { status: prepared.status };
  const origin = ipoSinghApiOrigin(deps.origin);
  if (!origin) return { status: "unavailable" };
  const limit = options.limit ?? searchPageLimit;
  const maxPages = options.maxPages ?? maxSearchPages;
  const items: IpoSummary[] = [];
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await readSearchPage(origin, searchParams(prepared.query, limit, cursor ?? undefined), deps.fetch);
    if (page.status !== "ready") return page;
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return { status: "ready", items, truncated: cursor !== null };
}

/** One document per slug. A repeated slug is requested once. A missing issue stays null. */
export async function loadIpoDocuments(slugs: readonly string[], deps: CatalogDeps = {}): Promise<CompareDocumentsResult> {
  const origin = ipoSinghApiOrigin(deps.origin);
  if (!origin) return { status: "unavailable" };
  const unique: string[] = [];
  for (const slug of slugs) {
    if (!unique.includes(slug)) unique.push(slug);
  }
  const loaded = await Promise.all(unique.map((slug) => readIpoDocument(origin, slug, deps.fetch)));
  const ipos: CompareDocument[] = [];
  for (const item of loaded) {
    if (item === "failed") return { status: "unavailable" };
    ipos.push(item === "missing" ? null : item);
  }
  return { status: "ready", ipos };
}

export type CalendarCatalogQuery = {
  board?: Board;
  from?: string;
  to?: string;
};

/** Stored open, close, allotment, and listing dates. An empty page stays empty. */
export async function loadCalendarCatalog(deps: CatalogDeps = {}, query: CalendarCatalogQuery = {}): Promise<CalendarCatalogResult> {
  const origin = ipoSinghApiOrigin(deps.origin);
  if (!origin) return { status: "unavailable" };
  const entries: CalendarEntry[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ limit: String(pageLimit) });
    if (query.board) params.set("board", query.board);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (cursor) params.set("cursor", cursor);
    const response = await readResponse(origin, `/api/v1/calendar?${params.toString()}`, deps.fetch);
    if (response.status !== 200) return { status: "unavailable" };
    const parsed = calendarPageSchema.safeParse(response.body);
    if (!parsed.success) return { status: "unavailable" };
    entries.push(...parsed.data.items);
    cursor = parsed.data.page.nextCursor;
    if (!cursor) break;
  }
  return { status: "ready", entries, truncated: cursor !== null };
}

/** Catalogue slugs for the sitemap. Summary pages only, with no per-IPO document reads. */
export async function loadSitemapCatalog(deps: CatalogDeps = {}): Promise<SitemapCatalogResult> {
  const origin = ipoSinghApiOrigin(deps.origin);
  if (!origin) return { status: "unavailable" };
  const issues: SitemapIssue[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ limit: String(pageLimit) });
    if (cursor) params.set("cursor", cursor);
    const response = await readResponse(origin, `/api/v1/ipos?${params.toString()}`, deps.fetch);
    if (response.status !== 200) return { status: "unavailable" };
    const parsed = listPageSchema.safeParse(response.body);
    if (!parsed.success) return { status: "unavailable" };
    for (const item of parsed.data.items) {
      if (!stableIdSchema.safeParse(item.slug).success || seen.has(item.slug)) continue;
      seen.add(item.slug);
      issues.push({
        slug: item.slug,
        updatedAt: typeof item.provenance.retrievedAt === "string" ? item.provenance.retrievedAt : null,
      });
    }
    cursor = parsed.data.page.nextCursor;
    if (!cursor) break;
  }
  return { status: "ready", issues, truncated: cursor !== null };
}

/** Listed issues from IPO Singh, then each stored document. GMP history is not requested. */
export async function loadListedCatalog(deps: CatalogDeps = {}): Promise<ListedCatalogResult> {
  const origin = ipoSinghApiOrigin(deps.origin);
  if (!origin) return { status: "unavailable" };
  const slugs: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({
      status: "listed",
      sort: "listing",
      direction: "desc",
      limit: String(pageLimit),
    });
    if (cursor) params.set("cursor", cursor);
    const response = await readResponse(origin, `/api/v1/ipos?${params.toString()}`, deps.fetch);
    if (response.status !== 200) return { status: "unavailable" };
    const parsed = listPageSchema.safeParse(response.body);
    if (!parsed.success) return { status: "unavailable" };
    for (const item of parsed.data.items) {
      if (item.status === "listed" && stableIdSchema.safeParse(item.slug).success) slugs.push(item.slug);
    }
    cursor = parsed.data.page.nextCursor;
    if (!cursor) break;
  }
  const hydrated = await hydrate(origin, slugs, deps.fetch);
  if (hydrated.status !== "ready") return { status: "unavailable" };
  return { status: "ready", ipos: hydrated.ipos, truncated: cursor !== null };
}

export async function loadDetailCatalog(
  slug: string,
  deps: CatalogDeps = {},
): Promise<
  | {
      status: "ready";
      ipo: Ipo;
      gmpHistory: ReturnType<typeof gmpHistoryResponseSchema.parse>["observations"];
      gmpSourceName: string | null;
      gmpHistoryRetrievedAt: string | null;
      gmpHistoryWindow: ReturnType<typeof gmpHistoryResponseSchema.parse>["window"] | null;
      gmpHistoryStatus: "ready" | "unavailable";
      subscriptionHistory: ReturnType<typeof subscriptionHistoryResponseSchema.parse>["observations"];
      subscriptionSourceName: string | null;
      subscriptionHistoryRetrievedAt: string | null;
      subscriptionHistoryStatus: "ready" | "unavailable";
    }
  | { status: "missing" }
  | { status: "unavailable" }
> {
  if (!stableIdSchema.safeParse(slug).success) return { status: "missing" };
  const origin = ipoSinghApiOrigin(deps.origin);
  if (!origin) return { status: "unavailable" };
  const detail = await readResponse(origin, `/api/v1/ipos/${slug}`, deps.fetch);
  if (detail.status === 404) return { status: "missing" };
  const ipo = ipoSchema.safeParse(detail.body);
  if (detail.status !== 200 || !ipo.success) return { status: "unavailable" };
  const [gmp, subscription] = await Promise.all([
    readResponse(origin, `/api/v1/ipos/${slug}/gmp/history`, deps.fetch),
    readResponse(origin, `/api/v1/ipos/${slug}/subscription/history`, deps.fetch),
  ]);
  const gmpHistory = gmp.status === 200 ? gmpHistoryResponseSchema.safeParse(gmp.body) : null;
  const subscriptionHistory = subscription.status === 200 ? subscriptionHistoryResponseSchema.safeParse(subscription.body) : null;
  const historyReady = gmpHistory?.success === true;
  const subscriptionReady = subscriptionHistory?.success === true;
  return {
    status: "ready",
    ipo: ipo.data,
    gmpHistory: historyReady ? gmpHistory.data.observations : [],
    gmpSourceName: historyReady ? gmpHistory.data.provenance.sourceName : null,
    gmpHistoryRetrievedAt: historyReady ? gmpHistory.data.provenance.retrievedAt : null,
    gmpHistoryWindow: historyReady ? (gmpHistory.data.window ?? null) : null,
    gmpHistoryStatus: historyReady ? "ready" : "unavailable",
    subscriptionHistory: subscriptionReady ? subscriptionHistory.data.observations : [],
    subscriptionSourceName: subscriptionReady ? subscriptionHistory.data.provenance.sourceName : (ipo.data.subscription ? ipo.data.provenance.sourceName : null),
    subscriptionHistoryRetrievedAt: subscriptionReady ? subscriptionHistory.data.provenance.retrievedAt : null,
    subscriptionHistoryStatus: subscriptionReady ? "ready" : "unavailable",
  };
}

async function readIpoDocument(origin: URL, slug: string, fetchImpl: typeof fetch | undefined): Promise<Ipo | "missing" | "failed"> {
  if (!stableIdSchema.safeParse(slug).success) return "missing";
  const response = await readResponse(origin, `/api/v1/ipos/${slug}`, fetchImpl);
  if (response.status === 404) return "missing";
  if (response.status !== 200) return "failed";
  const parsed = ipoSchema.safeParse(response.body);
  return parsed.success ? parsed.data : "failed";
}

async function hydrate(origin: URL, slugs: readonly string[], fetchImpl: typeof fetch | undefined): Promise<CatalogResult> {
  const ipos: Ipo[] = [];
  const width = 4;
  for (let index = 0; index < slugs.length; index += width) {
    const batch = slugs.slice(index, index + width);
    const loaded = await Promise.all(batch.map((slug) => readJson(origin, `/api/v1/ipos/${slug}`, fetchImpl)));
    for (const body of loaded) {
      const parsed = ipoSchema.safeParse(body);
      if (!parsed.success) return { status: "unavailable", ipos: [] };
      ipos.push(parsed.data);
    }
  }
  return { status: "ready", ipos };
}

async function readJson(origin: URL, path: string, fetchImpl: typeof fetch | undefined): Promise<unknown> {
  const response = await readResponse(origin, path, fetchImpl);
  return response.status === 200 ? response.body : null;
}

async function readResponse(
  origin: URL,
  path: string,
  fetchImpl: typeof fetch | undefined,
  timeoutMs = 4_000,
): Promise<{ status: number; body: unknown }> {
  const url = new URL(path, origin);
  if (url.origin !== origin.origin) return { status: 0, body: null };
  try {
    const response = await (fetchImpl ?? fetch)(url, {
      headers: { accept: "application/json", ...internalServiceHeaders() },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) return { status: response.status, body: null };
    const body: unknown = response.status === 200 ? await response.json() : null;
    return { status: response.status, body };
  } catch {
    return { status: 0, body: null };
  }
}
