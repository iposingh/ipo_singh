/**
 * Process-local aggregate counters for promotion impressions and clicks.
 * No account, device fingerprint, IP, or PAN is stored with the event.
 */

export type PromotionEventKind = "impression" | "click";

export type PromotionEventTotals = {
  impressions: number;
  clicks: number;
};

const totals = new Map<string, PromotionEventTotals>();

export function resetPromotionEventsForTests(): void {
  totals.clear();
}

export function recordPromotionEvent(bannerId: string, event: PromotionEventKind): PromotionEventTotals {
  const current = totals.get(bannerId) ?? { impressions: 0, clicks: 0 };
  const next =
    event === "impression"
      ? { impressions: current.impressions + 1, clicks: current.clicks }
      : { impressions: current.impressions, clicks: current.clicks + 1 };
  totals.set(bannerId, next);
  return next;
}

export function readPromotionEventTotals(bannerId: string): PromotionEventTotals {
  return totals.get(bannerId) ?? { impressions: 0, clicks: 0 };
}
