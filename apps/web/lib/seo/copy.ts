import type { Board, IpoStatus } from "@ipo-singh/contracts";
import { boardLabel, statusLabel } from "../../features/ipos/labels.ts";

export type SeoOffer = {
  companyName: string;
  board: Board;
  status: IpoStatus | null;
  offer: {
    priceBand: { lowRupees: number | null; highRupees: number | null };
    issuePriceRupees: number | null;
  };
  dates?: {
    openDate?: string | null;
    closeDate?: string | null;
    listingDate?: string | null;
  };
};

const descriptionLimit = 160;

/** One sentence a search result can show. Stored prices and dates only. No GMP and no rating. */
export function detailDescription(ipo: SeoOffer): string {
  const parts = [`${ipo.companyName} ${boardLabel(ipo.board)} IPO on IPO Singh.`];
  if (ipo.status) parts.push(`${statusLabel(ipo.status)}.`);
  const openDate = ipo.dates?.openDate ?? null;
  const closeDate = ipo.dates?.closeDate ?? null;
  const listingDate = ipo.dates?.listingDate ?? null;
  if (ipo.status === "upcoming" && openDate) parts.push(`Opens ${openDate}.`);
  else if (ipo.status === "open" && closeDate) parts.push(`Closes ${closeDate}.`);
  else if (ipo.status === "listed" && listingDate) parts.push(`Listed ${listingDate}.`);
  const low = ipo.offer.priceBand.lowRupees;
  const high = ipo.offer.priceBand.highRupees;
  if (low !== null && high !== null) parts.push(`Price band ${rupees(low)} to ${rupees(high)}.`);
  else if (ipo.offer.issuePriceRupees !== null) parts.push(`Issue price ${rupees(ipo.offer.issuePriceRupees)}.`);
  else parts.push("Stored prices stay blank when IPO Singh does not have them.");
  return metaDescription(parts.join(" "));
}

export function metaDescription(text: string, max = descriptionLimit): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const base = (space > 80 ? cut.slice(0, space) : cut).replace(/[.,;: ]+$/, "");
  return `${base}.`;
}

export function rupees(value: number): string {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)}`;
}
