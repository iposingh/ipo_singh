import { directoryRowSchema, type DirectoryRow } from "../modules/catalog/present.ts";
import { readDirectory } from "../modules/catalog/load.ts";
import type { CacheHandle } from "../cache/connection.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import { PersistenceError } from "../db/persistence-error.ts";
import { HttpError } from "../shared/errors.ts";
import type { Logger } from "../shared/logger.ts";
import type { IpoSummary } from "@ipo-singh/contracts";
import { z } from "zod";

const directorySchema = z
  .object({
    rows: z.array(directoryRowSchema),
    truncated: z.boolean(),
  })
  .strict();

/** Reads the same public catalogue cache used by the IPO lists. */
export async function loadCatalogueRows(
  database: DatabaseHandle,
  cache: CacheHandle,
  logger: Logger,
  visible = true,
): Promise<DirectoryRow[]> {
  if (!visible) return [];
  let status: Awaited<ReturnType<DatabaseHandle["check"]>>;
  try {
    status = await database.check();
  } catch (error) {
    logger.error("Database read failed", { detail: error instanceof Error ? error.message : "unknown" });
    throw new HttpError(503, "unavailable", "IPO data is temporarily unavailable.");
  }
  if (status === "unavailable") throw new HttpError(503, "unavailable", "IPO data is temporarily unavailable.");
  if (status !== "ok" || !database.store) throw new HttpError(503, "unavailable", "IPO data is temporarily unavailable.");
  const store = database.store;
  try {
    const directory = await cache.service.getOrLoad({
      namespace: "public",
      resource: "listings",
      id: "catalogue",
      meter: "public",
      load: () => readDirectory(store),
      parse: (value) => directorySchema.parse(value),
    });
    return directory.value.rows;
  } catch (error) {
    if (error instanceof HttpError || error instanceof PersistenceError) throw error;
    throw new PersistenceError("IPO data is temporarily unavailable.");
  }
}

export async function savedIssueSummaries(
  database: DatabaseHandle,
  cache: CacheHandle,
  logger: Logger,
  visible = true,
): Promise<Map<string, IpoSummary>> {
  const rows = await loadCatalogueRows(database, cache, logger, visible);
  return new Map(rows.map((row) => [row.summary.id, row.summary]));
}
