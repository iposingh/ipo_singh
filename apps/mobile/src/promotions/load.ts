import { publicPromotionResponseSchema, type PublicPromotionResponse } from "@ipo-singh/contracts";
import { requestJson } from "../api/client.ts";
import { MobileApiError } from "../api/errors.ts";
import type { AppEnvironment } from "../api/origin.ts";
import { shareFlight } from "../catalogue/flights.ts";
import { cachePolicies, readCached, writeCached, type JsonCache } from "../catalogue/response-cache.ts";
import { bannersFromResponse, houseBanners, type MobileBanner } from "./model.ts";

export const promotionsPath = "/api/v1/promotions";
export const promotionOfflineNote = "This device is offline. Showing the last saved promotions.";
export const promotionRefreshNote = "Promotions could not be refreshed. Showing the last saved promotions — not a live update.";

export type PromotionLoad = {
  banners: MobileBanner[];
  notice: string | null;
};

const promotionFlights = new Map<string, Promise<PromotionLoad>>();

export function promotionCacheKey(origin: string): string {
  return `ipo-singh.promotions.${encodeURIComponent(origin)}`;
}

export async function loadPromotions(input: {
  origin: string;
  site?: string;
  appEnv: AppEnvironment;
  offline: boolean;
  force?: boolean;
  cache: JsonCache;
  now: Date;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<PromotionLoad> {
  const key = promotionCacheKey(input.origin);
  if (input.force || input.offline) return fetchPromotions(input, key);
  return shareFlight(promotionFlights, key, () => fetchPromotions(input, key));
}

async function fetchPromotions(
  input: {
    origin: string;
    site?: string;
    appEnv: AppEnvironment;
    offline: boolean;
    force?: boolean;
    cache: JsonCache;
    now: Date;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  },
  key: string,
): Promise<PromotionLoad> {
  const context = { origin: input.origin, site: input.site, appEnv: input.appEnv };
  const cached = await readCached(input.cache, key, publicPromotionResponseSchema, input.now, true, cachePolicies.promotions);

  if (input.offline) return fromCache(cached, context, promotionOfflineNote);
  if (!input.force && cached.hit === "fresh") return present(bannersFromResponse(cached.value, context), null);

  try {
    const response = await requestJson({
      origin: input.origin,
      path: promotionsPath,
      schema: publicPromotionResponseSchema,
      fetchImpl: input.fetchImpl,
      signal: input.signal,
    });
    await writeCached(input.cache, key, response, input.now);
    return present(bannersFromResponse(response, context), null);
  } catch (error) {
    if (error instanceof MobileApiError && error.kind === "cancelled") throw error;
    if (cached.hit !== "miss") return present(bannersFromResponse(cached.value, context), promotionRefreshNote);
    return present(houseBanners(), null);
  }
}

function fromCache(
  cached: { hit: "fresh" | "stale"; value: PublicPromotionResponse } | { hit: "miss" },
  context: { origin: string; site?: string; appEnv: AppEnvironment },
  notice: string,
): PromotionLoad {
  if (cached.hit === "miss") return present(houseBanners(), null);
  return present(bannersFromResponse(cached.value, context), notice);
}

function present(banners: MobileBanner[], notice: string | null): PromotionLoad {
  return { banners, notice: banners.length === 0 ? null : notice };
}
