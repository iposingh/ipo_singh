import { gmpHistoryResponseSchema, subscriptionHistoryResponseSchema, type Provenance } from "@ipo-singh/contracts";
import type { z } from "zod";
import { requestJson } from "../api/client.ts";
import { MobileApiError, apiFailureMessage } from "../api/errors.ts";
import { shareFlight } from "./flights.ts";
import { gmpHistoryRequestPath, subscriptionHistoryRequestPath } from "./routes.ts";
import { cachePolicies, historyCacheKey, readCached, writeCached, type JsonCache } from "./response-cache.ts";

export const offlineHistoryNote =
  "This device is offline. Showing the last saved history. These GMP and subscription figures are not a live update.";
export const fallbackHistoryNote =
  "The history could not be refreshed. Showing the last saved history. These figures may not be current.";

export type GmpHistoryDocument = z.infer<typeof gmpHistoryResponseSchema>;
export type SubscriptionHistoryDocument = z.infer<typeof subscriptionHistoryResponseSchema>;

export type ChartPhase<T> =
  | { phase: "loading" }
  | { phase: "ready"; value: T; notice: string | null }
  | { phase: "unavailable"; message: string };

export type HistoryLoad<T> =
  | {
      status: "ready";
      value: T;
      source: "network" | "cache";
      cacheReason: "fresh" | "offline" | "fallback" | null;
      cacheNote: string | null;
    }
  | { status: "unavailable"; message: string; cacheNote: string | null };

type ReadyHistory<T> = Extract<HistoryLoad<T>, { status: "ready" }>;

export type HistoryRequest = {
  origin: string;
  offline: boolean;
  force?: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: Date;
};

function noteFor(readFailed: boolean, write: "saved" | "failed" | null, fallback: boolean): string | null {
  if (write === "failed") return "The history could not be saved on this device.";
  if (readFailed) return "The saved history could not be read.";
  if (fallback) return fallbackHistoryNote;
  return null;
}

export function createHistoryClient(store: JsonCache) {
  const memory = new Map<string, { storedAt: number; history: unknown }>();
  const flights = new Map<string, Promise<unknown>>();

  async function saved<T>(key: string, schema: z.ZodType<T>, now: Date, allowStale: boolean): Promise<{ history: ReadyHistory<T> | null; failed: boolean }> {
    const cached = await readCached(store, key, schema, now, allowStale, cachePolicies.history);
    if (cached.hit === "miss") return { history: null, failed: cached.failed };
    const history: ReadyHistory<T> = {
      status: "ready",
      value: cached.value,
      source: "cache",
      cacheReason: cached.hit === "fresh" ? "fresh" : "offline",
      cacheNote: null,
    };
    memory.set(key, { storedAt: cached.storedAt, history });
    return { history, failed: false };
  }

  async function fetchHistory<T extends { provenance: Provenance }>(
    path: string | null,
    key: string,
    schema: z.ZodType<T>,
    request: HistoryRequest,
  ): Promise<HistoryLoad<T>> {
    if (!path) return { status: "unavailable", message: "This IPO address is not valid.", cacheNote: null };
    const now = request.now ?? new Date();
    if (request.offline) {
      const cached = await saved(key, schema, now, true);
      if (cached.history) return { ...cached.history, cacheReason: "offline", cacheNote: offlineHistoryNote };
      return { status: "unavailable", message: apiFailureMessage.offline, cacheNote: cached.failed ? "The saved history could not be read." : null };
    }
    let readFailed = false;
    if (!request.force) {
      const cached = await saved(key, schema, now, false);
      readFailed = cached.failed;
      if (cached.history) return cached.history;
    }
    try {
      const value = await requestJson({
        origin: request.origin,
        path,
        schema,
        fetchImpl: request.fetchImpl,
        signal: request.signal,
      });
      const write = await writeCached(store, key, value, now);
      const ready: ReadyHistory<T> = {
        status: "ready",
        value,
        source: "network",
        cacheReason: null,
        cacheNote: noteFor(readFailed, write, false),
      };
      memory.set(key, { storedAt: now.getTime(), history: ready });
      return ready;
    } catch (error) {
      if (error instanceof MobileApiError && error.kind === "cancelled") throw error;
      const fallback = await saved(key, schema, now, true);
      if (fallback.history) return { ...fallback.history, cacheReason: "fallback", cacheNote: noteFor(readFailed || fallback.failed, null, true) };
      const message = error instanceof MobileApiError ? error.message : apiFailureMessage.network;
      return { status: "unavailable", message, cacheNote: readFailed || fallback.failed ? "The saved history could not be read." : null };
    }
  }

  function load<T extends { provenance: Provenance }>(path: string | null, key: string, schema: z.ZodType<T>, request: HistoryRequest): Promise<HistoryLoad<T>> {
    const now = request.now ?? new Date();
    if (request.force) memory.delete(key);
    if (!request.force && !request.offline) {
      const remembered = memory.get(key);
      if (remembered && now.getTime() - remembered.storedAt <= cachePolicies.history.freshMs) {
        return Promise.resolve(remembered.history as ReadyHistory<T>);
      }
      return shareFlight(flights, key, () => fetchHistory(path, key, schema, request)) as Promise<HistoryLoad<T>>;
    }
    return fetchHistory(path, key, schema, request);
  }

  return {
    loadGmpHistory(slug: string, request: HistoryRequest) {
      const path = gmpHistoryRequestPath(slug);
      const key = historyCacheKey("gmp", request.origin, slug);
      return load(path, key, gmpHistoryResponseSchema, request);
    },
    loadSubscriptionHistory(slug: string, request: HistoryRequest) {
      const path = subscriptionHistoryRequestPath(slug);
      const key = historyCacheKey("subscription", request.origin, slug);
      return load(path, key, subscriptionHistoryResponseSchema, request);
    },
  };
}
