/**
 * Privacy-conscious promotion events.
 * Sends only banner id, event kind, and placement — no account, device, or PAN fields.
 * Silently no-ops when the API does not expose the events route.
 */

export const promotionEventsPath = "/api/v1/promotions/events";

export type PromotionAnalyticsEvent = "impression" | "click";

export type PromotionAnalyticsPayload = {
  bannerId: string;
  event: PromotionAnalyticsEvent;
  placement: "home";
};

const seenImpressions = new Set<string>();

export function resetPromotionAnalyticsForTests(): void {
  seenImpressions.clear();
}

export function shouldRecordImpression(bannerId: string, sessionKey = "home"): boolean {
  const key = `${sessionKey}:${bannerId}`;
  if (seenImpressions.has(key)) return false;
  seenImpressions.add(key);
  return true;
}

export function promotionEventBody(input: PromotionAnalyticsPayload): PromotionAnalyticsPayload | null {
  const bannerId = input.bannerId.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bannerId) || bannerId.length > 80) return null;
  if (input.event !== "impression" && input.event !== "click") return null;
  if (input.placement !== "home") return null;
  return { bannerId, event: input.event, placement: "home" };
}

/** Best-effort POST. Never throws into UI. Does not attach auth or personal data. */
export async function trackPromotionEvent(input: {
  origin: string;
  bannerId: string;
  event: PromotionAnalyticsEvent;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<"sent" | "skipped" | "unavailable"> {
  const body = promotionEventBody({ bannerId: input.bannerId, event: input.event, placement: "home" });
  if (!body) return "skipped";
  if (input.event === "impression" && !shouldRecordImpression(body.bannerId)) return "skipped";
  let base: URL;
  try {
    base = new URL(input.origin);
  } catch {
    return "skipped";
  }
  if ((base.protocol !== "http:" && base.protocol !== "https:") || base.username || base.password) return "skipped";
  const url = new URL(promotionEventsPath, base);
  if (url.origin !== base.origin) return "skipped";
  try {
    const response = await (input.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: input.signal,
    });
    if (response.status === 404 || response.status === 501) return "unavailable";
    if (!response.ok) return "unavailable";
    return "sent";
  } catch {
    return "unavailable";
  }
}
