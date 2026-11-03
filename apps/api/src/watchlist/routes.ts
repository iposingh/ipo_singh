import {
  saveWatchlistRequestSchema,
  stableIdSchema,
  watchlistItemSchema,
  watchlistMembershipSchema,
  watchlistResponseSchema,
  type IpoSummary,
  type WatchlistItem,
} from "@ipo-singh/contracts";
import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAccount } from "../accounts/middleware.ts";
import { createAccountId } from "../accounts/tokens.ts";
import type { CacheHandle } from "../cache/connection.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import { HttpError } from "../shared/errors.ts";
import type { Logger } from "../shared/logger.ts";
import { savedIssueSummaries } from "./catalogue.ts";
import { watchlistItemLimit, type WatchlistRecord, type WatchlistStore } from "./records.ts";

export type WatchlistRouterDeps = {
  database: DatabaseHandle;
  cache: CacheHandle;
  logger: Logger;
  /** False after the IPO Guru subscription ends. Saved rows then stay unavailable. */
  catalogueVisible?: boolean;
};

function present(record: WatchlistRecord, summary: IpoSummary | null): WatchlistItem {
  return watchlistItemSchema.parse({
    ipoId: record.ipoId,
    addedAt: record.addedAt.toISOString(),
    note: record.note,
    availability: summary ? "available" : "unavailable",
    ipo: summary,
  });
}

function storeOrThrow(database: DatabaseHandle): WatchlistStore {
  if (!database.watchlist) throw new HttpError(503, "unavailable", "The watchlist is temporarily unavailable.");
  return database.watchlist;
}

function userId(req: Request): string {
  if (req.auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
  return req.auth.userId;
}

function withAccount(req: Request, res: Response, next: NextFunction, run: () => Promise<void>): void {
  requireAccount(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }
    void run().catch(next);
  });
}

function blankNote(body: unknown): unknown {
  if (!body || typeof body !== "object" || !("note" in body)) return body;
  const record = body as { note?: unknown };
  if (typeof record.note === "string" && record.note.trim() === "") return { ...record, note: null };
  return body;
}

function ipoIdFrom(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = stableIdSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "ipoId", message: "Choose an IPO." }]);
  return parsed.data;
}

export function createWatchlistRouter(deps: WatchlistRouterDeps): Router {
  const router = Router();

  router.get("/", (req, res, next) => {
    withAccount(req, res, next, async () => {
      const owner = userId(req);
      const store = storeOrThrow(deps.database);
      const [rows, summaries] = await Promise.all([
        store.listForUser(owner),
        savedIssueSummaries(deps.database, deps.cache, deps.logger, deps.catalogueVisible !== false),
      ]);
      res.status(200).json(
        watchlistResponseSchema.parse({
          items: rows.slice(0, watchlistItemLimit).map((row) => present(row, summaries.get(row.ipoId) ?? null)),
        }),
      );
    });
  });

  router.get("/:ipoId", (req, res, next) => {
    withAccount(req, res, next, async () => {
      const owner = userId(req);
      const ipoId = ipoIdFrom(req.params.ipoId);
      const row = await storeOrThrow(deps.database).find(owner, ipoId);
      res.status(200).json(
        watchlistMembershipSchema.parse({
          ipoId,
          saved: row !== null,
          addedAt: row ? row.addedAt.toISOString() : null,
          note: row?.note ?? null,
        }),
      );
    });
  });

  router.post("/", (req, res, next) => {
    withAccount(req, res, next, async () => {
      const owner = userId(req);
      const parsed = saveWatchlistRequestSchema.safeParse(blankNote(req.body));
      if (!parsed.success) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "ipoId", message: "Choose an IPO." }]);
      }
      const store = storeOrThrow(deps.database);
      const summaries = await savedIssueSummaries(deps.database, deps.cache, deps.logger, deps.catalogueVisible !== false);
      const summary = summaries.get(parsed.data.ipoId) ?? null;
      if (!summary) throw new HttpError(404, "not_found", "That IPO is not stored.");
      const existing = await store.find(owner, parsed.data.ipoId);
      if (!existing && (await store.listForUser(owner)).length >= watchlistItemLimit) {
        throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "ipoId", message: "The watchlist already has 200 issues." }]);
      }
      const noteProvided = Object.prototype.hasOwnProperty.call(parsed.data, "note");
      const saved = await store.save(
        {
          id: existing?.id ?? createAccountId(),
          userId: owner,
          ipoId: parsed.data.ipoId,
          addedAt: existing?.addedAt ?? new Date(),
          note: noteProvided ? (parsed.data.note ?? null) : (existing?.note ?? null),
        },
        noteProvided,
      );
      deps.logger.info("account_audit", { event: "watchlist_save", outcome: "succeeded", userId: owner });
      res.status(200).json(present(saved, summary));
    });
  });

  router.delete("/:ipoId", (req, res, next) => {
    withAccount(req, res, next, async () => {
      const owner = userId(req);
      const ipoId = ipoIdFrom(req.params.ipoId);
      const removed = await storeOrThrow(deps.database).remove(owner, ipoId);
      if (!removed) throw new HttpError(404, "not_found", "That saved IPO was not found.");
      deps.logger.info("account_audit", { event: "watchlist_remove", outcome: "succeeded", userId: owner });
      res.status(204).end();
    });
  });

  return router;
}
