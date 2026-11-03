import {
  calendarQuerySchema,
  financialsResponseSchema,
  gmpHistoryResponseSchema,
  gmpResponseSchema,
  ipoListQuerySchema,
  ipoSchema,
  pageSchema,
  registrarResponseSchema,
  searchQuerySchema,
  subscriptionHistoryResponseSchema,
  subscriptionResponseSchema,
  ipoSummarySchema,
  calendarEntrySchema,
  stableIdSchema,
} from "@ipo-singh/contracts";
import { Router } from "express";
import { z } from "zod";
import type { CacheHandle } from "../../cache/connection.ts";
import type { CacheResource } from "../../config/cache-policy.ts";
import { biddingPhase, subscriptionFreshMs } from "../../config/cache-policy.ts";
import type { AppConfig } from "../../config/env.ts";
import { ipoGuruCatalogueVisible } from "../../config/ipoguru.ts";
import type { DatabaseHandle } from "../../db/handle.ts";
import type { PersistenceStore } from "../../db/repositories.ts";
import { HttpError } from "../../shared/errors.ts";
import type { Logger } from "../../shared/logger.ts";
import { registerRoute } from "../../shared/typed-route.ts";
import { readDirectory, readIpoBySlug } from "./load.ts";
import {
  financialsPayload,
  gmpHistoryPayload,
  gmpPayload,
  registrarPayload,
  refreshPublicIpoStatus,
  refreshPublicSummaryStatus,
  subscriptionHistoryPayload,
  subscriptionPayload,
  directoryRowSchema,
} from "./present.ts";
import {
  CursorError,
  calendarEntries,
  closeInstant,
  decodeCursor,
  defaultPageLimit,
  filterDirectory,
  pageOf,
} from "./query.ts";

const listPageSchema = pageSchema(ipoSummarySchema);
const calendarPageSchema = pageSchema(calendarEntrySchema);
const directorySchema = z.object({
  rows: z.array(directoryRowSchema),
  truncated: z.boolean(),
}).strict();

/** Redis refuses a `session` key. The public response still uses the contract field. */
const storedGmpHistorySchema = gmpHistoryResponseSchema
  .omit({ observations: true })
  .extend({
    observations: z.array(
      z
        .object({
          observedAt: z.string().datetime({ offset: true }),
          observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
          amountRupees: z.number().finite().nullable(),
          percent: z.number().finite().nullable(),
          tradingSession: z.enum(["daily", "intraday"]),
          slotLabel: z.string().trim().min(1).max(40).nullable().optional(),
        })
        .strict(),
    ),
  })
  .strict();

const searchPageLimit = 20;
const minimumSearchLength = 2;
const listFields = ["board", "status", "q", "sort", "direction", "limit", "cursor"] as const;
const searchFields = ["board", "status", "q", "sort", "direction", "limit", "cursor", "from", "to"] as const;
const calendarFields = ["board", "from", "to", "limit", "cursor"] as const;

function hasDisallowedSearchText(value: string): boolean {
  if (value.includes("<") || value.includes(">")) return true;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 31) return true;
  }
  return false;
}

function fieldError(field: string, message: string): never {
  throw new HttpError(400, "validation_error", "Request validation failed.", [{ field, message }]);
}

function readQuery(query: Record<string, unknown>, allowed: readonly string[]): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    const field = key.slice(0, 80) || "query";
    if (!allowed.includes(key)) fieldError(field, "Unknown query parameter.");
    if (typeof value !== "string") fieldError(field, "Expected one text value.");
    output[key] = value;
  }
  return output;
}

function withoutEmpty(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9][0-9]{0,2}$/.test(value)) fieldError("limit", "Limit must be a whole number from 1 to 100.");
  return Number(value);
}

function optionalDate(data: object, key: "from" | "to"): string | undefined {
  if (!Object.hasOwn(data, key)) return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function parseListQuery(query: Record<string, unknown>, requireQuery: boolean) {
  const raw = readQuery(query, requireQuery ? searchFields : listFields);
  const schema = requireQuery ? searchQuerySchema : ipoListQuerySchema;
  const parsed = schema.safeParse(
    withoutEmpty({
      board: raw.board,
      status: raw.status,
      q: raw.q,
      sort: raw.sort,
      direction: raw.direction,
      limit: parseLimit(raw.limit),
      cursor: raw.cursor,
      from: requireQuery ? raw.from : undefined,
      to: requireQuery ? raw.to : undefined,
    }),
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue && issue.path.length > 0 ? String(issue.path[0]) : "query";
    fieldError(field, "Query parameter is invalid.");
  }
  if (requireQuery) {
    const q = parsed.data.q ?? "";
    if (q.length < minimumSearchLength) fieldError("q", "Search text must be at least 2 characters.");
    if (hasDisallowedSearchText(q)) fieldError("q", "Search text contains characters that are not allowed.");
    if ((parsed.data.limit ?? defaultPageLimit) > searchPageLimit) fieldError("limit", "Search returns at most 20 results.");
  }
  const from = requireQuery ? optionalDate(parsed.data, "from") : undefined;
  const to = requireQuery ? optionalDate(parsed.data, "to") : undefined;
  if (from && to && from > to) fieldError("to", "The end date is before the start date.");
  let offset = 0;
  try {
    offset = decodeCursor(parsed.data.cursor);
  } catch (error) {
    if (error instanceof CursorError) fieldError("cursor", "Cursor is invalid.");
    throw error;
  }
  return {
    board: parsed.data.board,
    status: parsed.data.status,
    q: parsed.data.q,
    sort: parsed.data.sort ?? "open",
    direction: parsed.data.direction ?? "asc",
    limit: parsed.data.limit ?? defaultPageLimit,
    offset,
    from,
    to,
  };
}

function parseCalendarQuery(query: Record<string, unknown>) {
  const raw = readQuery(query, calendarFields);
  const parsed = calendarQuerySchema.safeParse(
    withoutEmpty({
      board: raw.board,
      from: raw.from,
      to: raw.to,
      limit: parseLimit(raw.limit),
      cursor: raw.cursor,
    }),
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue && issue.path.length > 0 ? String(issue.path[0]) : "query";
    fieldError(field, "Query parameter is invalid.");
  }
  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) {
    fieldError("to", "The end date is before the start date.");
  }
  let offset = 0;
  try {
    offset = decodeCursor(parsed.data.cursor);
  } catch (error) {
    if (error instanceof CursorError) fieldError("cursor", "Cursor is invalid.");
    throw error;
  }
  return {
    board: parsed.data.board,
    from: parsed.data.from,
    to: parsed.data.to,
    limit: parsed.data.limit ?? defaultPageLimit,
    offset,
  };
}

function parseSlug(value: string | string[] | undefined): string {
  const slug = Array.isArray(value) ? value[0] : value;
  const parsed = stableIdSchema.safeParse(slug);
  if (!parsed.success) fieldError("slug", "Slug is invalid.");
  return parsed.data;
}

async function openStore(database: DatabaseHandle, logger: Logger): Promise<PersistenceStore | null> {
  let status: Awaited<ReturnType<DatabaseHandle["check"]>>;
  try {
    status = await database.check();
  } catch (error) {
    logger.error("Database read failed", {
      detail: error instanceof Error ? error.message : "unknown",
    });
    throw new HttpError(503, "unavailable", "IPO data is temporarily unavailable.");
  }
  if (status === "unavailable") throw new HttpError(503, "unavailable", "IPO data is temporarily unavailable.");
  if (status !== "ok" || !database.store) return null;
  return database.store;
}

async function cached<T>(
  cache: CacheHandle,
  resource: CacheResource,
  id: string,
  schema: z.ZodType<T>,
  load: () => Promise<T>,
  freshMs?: number,
): Promise<T> {
  const result = await cache.service.getOrLoad({
    namespace: "public",
    resource,
    id,
    meter: "public",
    freshMs,
    load,
    parse: (value) => schema.parse(value),
  });
  return result.value;
}

export function createCatalogRouter(config: AppConfig, logger: Logger, database: DatabaseHandle, cache: CacheHandle): Router {
  const router = Router();
  const catalogueVisible = ipoGuruCatalogueVisible(config);

  async function directory(store: PersistenceStore) {
    if (!catalogueVisible) return { rows: [], truncated: false };
    return cached(cache, "listings", "catalogue-facts", directorySchema, () => readDirectory(store));
  }

  async function loadIssue(store: PersistenceStore, slug: string) {
    if (!catalogueVisible) return null;
    return readIpoBySlug(store, slug);
  }

  async function issue(store: PersistenceStore, slug: string) {
    if (!catalogueVisible) throw new HttpError(404, "not_found", "IPO not found.");
    const ipo = await cached(cache, "issue", slug, ipoSchema, async () => {
      const loaded = await loadIssue(store, slug);
      if (!loaded) throw new HttpError(404, "not_found", "IPO not found.");
      return loaded.ipo;
    });
    return refreshPublicIpoStatus(ipo);
  }

  registerRoute(router, {
    method: "get",
    path: "/ipos",
    response: listPageSchema,
    handler: async ({ req }) => {
      const query = parseListQuery(req.query, false);
      const store = await openStore(database, logger);
      if (!store) {
        return { status: 200, body: pageOf([], query.offset, query.limit, false) };
      }
      const loaded = await directory(store);
      const refreshed = {
        ...loaded,
        rows: loaded.rows.map((row) => ({ ...row, summary: refreshPublicSummaryStatus(row.summary) })),
      };
      const rows = filterDirectory(refreshed.rows, query);
      const page = pageOf(rows, query.offset, query.limit, refreshed.truncated);
      return { status: 200, body: { items: page.items.map((row) => row.summary), page: page.page } };
    },
  });

  registerRoute(router, {
    method: "get",
    path: "/search",
    response: listPageSchema,
    handler: async ({ req }) => {
      const query = parseListQuery(req.query, true);
      const store = await openStore(database, logger);
      if (!store) {
        return { status: 200, body: pageOf([], query.offset, query.limit, false) };
      }
      const loaded = await directory(store);
      const refreshed = {
        ...loaded,
        rows: loaded.rows.map((row) => ({ ...row, summary: refreshPublicSummaryStatus(row.summary) })),
      };
      const rows = filterDirectory(refreshed.rows, query);
      const page = pageOf(rows, query.offset, query.limit, refreshed.truncated);
      return { status: 200, body: { items: page.items.map((row) => row.summary), page: page.page } };
    },
  });

  registerRoute(router, {
    method: "get",
    path: "/calendar",
    response: calendarPageSchema,
    handler: async ({ req }) => {
      const query = parseCalendarQuery(req.query);
      const store = await openStore(database, logger);
      if (!store) {
        return { status: 200, body: pageOf([], query.offset, query.limit, false) };
      }
      const loaded = await directory(store);
      const refreshed = {
        ...loaded,
        rows: loaded.rows.map((row) => ({ ...row, summary: refreshPublicSummaryStatus(row.summary) })),
      };
      const entries = calendarEntries(refreshed.rows, query);
      return { status: 200, body: pageOf(entries, query.offset, query.limit, refreshed.truncated) };
    },
  });

  registerRoute(router, {
    method: "get",
    path: "/ipos/:slug/gmp/history",
    response: gmpHistoryResponseSchema,
    handler: async ({ req }) => {
      const slug = parseSlug(req.params.slug);
      if (!catalogueVisible) throw new HttpError(404, "not_found", "IPO not found.");
      const store = await openStore(database, logger);
      if (!store) throw new HttpError(404, "not_found", "IPO not found.");
      const stored = await cached(cache, "history", `gmp-${slug}`, storedGmpHistorySchema, async () => {
        const loaded = await loadIssue(store, slug);
        if (!loaded) throw new HttpError(404, "not_found", "IPO not found.");
        const history = gmpHistoryPayload(loaded.ipo, loaded.gmp, loaded.gmpWindow);
        return {
          ipoId: history.ipoId,
          provenance: history.provenance,
          window: history.window,
          observations: history.observations.map((observation) => ({
            observedAt: observation.observedAt,
            observedOn: observation.observedOn ?? null,
            amountRupees: observation.amountRupees,
            percent: observation.percent,
            tradingSession: observation.session,
            slotLabel: observation.slotLabel ?? null,
          })),
        };
      });
      const body = gmpHistoryResponseSchema.parse({
        ipoId: stored.ipoId,
        provenance: stored.provenance,
        window: stored.window,
        observations: stored.observations.map((observation) => ({
          observedAt: observation.observedAt,
          observedOn: observation.observedOn ?? null,
          amountRupees: observation.amountRupees,
          percent: observation.percent,
          session: observation.tradingSession,
          slotLabel: observation.slotLabel ?? null,
        })),
      });
      return { status: 200, body };
    },
  });

  registerRoute(router, {
    method: "get",
    path: "/ipos/:slug/gmp",
    response: gmpResponseSchema,
    handler: async ({ req }) => {
      const slug = parseSlug(req.params.slug);
      if (!catalogueVisible) throw new HttpError(404, "not_found", "IPO not found.");
      const store = await openStore(database, logger);
      if (!store) throw new HttpError(404, "not_found", "IPO not found.");
      const body = await cached(cache, "gmp", slug, gmpResponseSchema, async () => {
        const loaded = await loadIssue(store, slug);
        if (!loaded) throw new HttpError(404, "not_found", "IPO not found.");
        return gmpPayload(loaded.ipo, loaded.gmp);
      });
      return { status: 200, body };
    },
  });

  registerRoute(router, {
    method: "get",
    path: "/ipos/:slug/subscription/history",
    response: subscriptionHistoryResponseSchema,
    handler: async ({ req }) => {
      const slug = parseSlug(req.params.slug);
      if (!catalogueVisible) throw new HttpError(404, "not_found", "IPO not found.");
      const store = await openStore(database, logger);
      if (!store) throw new HttpError(404, "not_found", "IPO not found.");
      const body = await cached(cache, "history", `sub-${slug}`, subscriptionHistoryResponseSchema, async () => {
        const loaded = await loadIssue(store, slug);
        if (!loaded) throw new HttpError(404, "not_found", "IPO not found.");
        return subscriptionHistoryPayload(loaded.ipo, loaded.subscription);
      });
      return { status: 200, body };
    },
  });

  registerRoute(router, {
    method: "get",
    path: "/ipos/:slug/subscription",
    response: subscriptionResponseSchema,
    handler: async ({ req }) => {
      const slug = parseSlug(req.params.slug);
      if (!catalogueVisible) throw new HttpError(404, "not_found", "IPO not found.");
      const store = await openStore(database, logger);
      if (!store) throw new HttpError(404, "not_found", "IPO not found.");
      const listed = await directory(store);
      const row = listed.rows.find((item) => item.summary.slug === slug);
      const phase = biddingPhase(new Date(), closeInstant(row?.summary.closeDate ?? null), config.cache.subscriptionClosingLeadMs);
      const body = await cached(
        cache,
        "subscription",
        slug,
        subscriptionResponseSchema,
        async () => {
          const loaded = await loadIssue(store, slug);
          if (!loaded) throw new HttpError(404, "not_found", "IPO not found.");
          return subscriptionPayload(loaded.ipo, loaded.subscription);
        },
        subscriptionFreshMs(config.cache, phase),
      );
      return { status: 200, body };
    },
  });

  registerRoute(router, {
    method: "get",
    path: "/ipos/:slug/financials",
    response: financialsResponseSchema,
    handler: async ({ req }) => {
      const slug = parseSlug(req.params.slug);
      if (!catalogueVisible) throw new HttpError(404, "not_found", "IPO not found.");
      const store = await openStore(database, logger);
      if (!store) throw new HttpError(404, "not_found", "IPO not found.");
      const body = await cached(cache, "history", `financials-${slug}`, financialsResponseSchema, async () => {
        const loaded = await loadIssue(store, slug);
        if (!loaded) throw new HttpError(404, "not_found", "IPO not found.");
        return financialsPayload(loaded.ipo, loaded.financialSource);
      });
      return { status: 200, body };
    },
  });

  registerRoute(router, {
    method: "get",
    path: "/ipos/:slug/registrar",
    response: registrarResponseSchema,
    handler: async ({ req }) => {
      const slug = parseSlug(req.params.slug);
      if (!catalogueVisible) throw new HttpError(404, "not_found", "IPO not found.");
      const store = await openStore(database, logger);
      if (!store) throw new HttpError(404, "not_found", "IPO not found.");
      const body = await cached(cache, "registrars", slug, registrarResponseSchema, async () => {
        const loaded = await loadIssue(store, slug);
        if (!loaded) throw new HttpError(404, "not_found", "IPO not found.");
        return registrarPayload(loaded.ipo, loaded.registrarSource);
      });
      return { status: 200, body };
    },
  });

  registerRoute(router, {
    method: "get",
    path: "/ipos/:slug",
    response: ipoSchema,
    handler: async ({ req }) => {
      const slug = parseSlug(req.params.slug);
      if (!catalogueVisible) throw new HttpError(404, "not_found", "IPO not found.");
      const store = await openStore(database, logger);
      if (!store) throw new HttpError(404, "not_found", "IPO not found.");
      return { status: 200, body: await issue(store, slug) };
    },
  });

  return router;
}
