import { connection } from "next/server";
import { internalServiceHeaders } from "@/lib/api/internal-headers";
import { ipoSinghApiOrigin } from "@/lib/api/ipo-singh";
import type { AdSlide } from "./ads.ts";
import { loadHouseAds } from "./house-ads.ts";
import { choosePromotionSlides, type RemotePromotions } from "./select.ts";

export async function loadHomePromotions(deps: { origin?: string; fetchImpl?: typeof fetch } = {}): Promise<readonly AdSlide[]> {
  await connection();
  const house = loadHouseAds();
  const origin = ipoSinghApiOrigin(deps.origin ?? process.env.IPO_SINGH_API_ORIGIN);
  if (!origin) return house;
  try {
    const response = await (deps.fetchImpl ?? fetch)(new URL("/api/v1/promotions", origin), {
      headers: { accept: "application/json", ...internalServiceHeaders() },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(4_000),
    });
    if (response.status !== 200) return house;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return house;
    const record = payload as { managed?: unknown; slides?: unknown };
    const remote: RemotePromotions = { managed: record.managed === true, slides: record.slides };
    return choosePromotionSlides(remote, house);
  } catch {
    return house;
  }
}
