import type { Ipo, IpoSummary } from "@ipo-singh/contracts";
import { istCalendarDate, resolveIpoLifecycle } from "@ipo-singh/core";

/** Re-resolve IST lifecycle so a stale Open cannot outlive the close date on the website. */
export function refreshIpoLifecycle(ipo: Ipo, now = new Date()): Ipo {
  const today = istCalendarDate(now);
  if (!today) return ipo;
  const listingConfirmed = Boolean(
    ipo.listing &&
      ((typeof ipo.listing.listingPriceRupees === "number" && Number.isFinite(ipo.listing.listingPriceRupees)) || ipo.status === "listed"),
  );
  const resolved = resolveIpoLifecycle({
    today,
    openDate: ipo.dates.openDate,
    closeDate: ipo.dates.closeDate,
    allotmentDate: ipo.dates.allotmentDate,
    listingDate: ipo.dates.listingDate,
    providerStatus: ipo.status,
    listingConfirmed,
    allotmentConfirmed: ipo.allotmentConfirmed === true,
  });
  if (resolved.status === "unknown" || resolved.status === ipo.status) return ipo;
  return { ...ipo, status: resolved.status };
}

export function refreshSummaryLifecycle(summary: IpoSummary, now = new Date()): IpoSummary {
  const today = istCalendarDate(now);
  if (!today) return summary;
  const resolved = resolveIpoLifecycle({
    today,
    openDate: summary.openDate,
    closeDate: summary.closeDate,
    allotmentDate: summary.allotmentDate ?? null,
    listingDate: summary.listingDate ?? null,
    providerStatus: summary.status,
    listingConfirmed: summary.status === "listed" || (typeof summary.listingPriceRupees === "number" && Number.isFinite(summary.listingPriceRupees)),
    allotmentConfirmed: summary.allotmentConfirmed === true,
  });
  if (resolved.status === "unknown" || resolved.status === summary.status) return summary;
  return { ...summary, status: resolved.status };
}
