import type { Ipo } from "@ipo-singh/contracts";
import { formatInr, formatIstDate, isPresentNumber } from "@ipo-singh/core";
import { Badge } from "@/components/ui/badge";
import { minimumInvestmentAmount } from "@/features/ipos/gmp-summary";
import { boardLabel, listingLifecycleLabel } from "@/features/ipos/labels";

export function IndiaDate({ value }: { value: string | null | undefined }) {
  const text = formatIstDate(value);
  if (text === "Unavailable") {
    return <span className="text-muted">Date unavailable</span>;
  }
  return <time dateTime={value ?? undefined}>{text}</time>;
}

export function BoardBadge({ board }: { board: Ipo["board"] }) {
  return <Badge>{boardLabel(board)}</Badge>;
}

export function StatusBadge({
  status,
  allotmentConfirmed,
}: {
  status: Ipo["status"];
  allotmentConfirmed?: boolean | null;
}) {
  const label = listingLifecycleLabel({ status, allotmentConfirmed });
  if (!status) {
    return <span className="text-sm text-muted">{label}</span>;
  }
  const confirmed = allotmentConfirmed === true;
  const tone =
    status === "open" || status === "listed" || confirmed
      ? "positive"
      : status === "upcoming" || status === "allotment" || status === "closed"
        ? "warning"
        : "neutral";
  return <Badge tone={tone}>{label}</Badge>;
}

export function LotSize({ shares }: { shares: number | null | undefined }) {
  if (!isPresentNumber(shares)) {
    return <span className="text-muted">Lot size unavailable</span>;
  }
  return <span className="tabular-nums">{new Intl.NumberFormat("en-IN").format(shares)} shares</span>;
}

export function MinimumInvestment({ offer }: { offer: Ipo["offer"] }) {
  const amount = minimumInvestmentAmount(offer);
  if (amount.status !== "value") {
    return <span className="text-muted">Unavailable</span>;
  }
  return <span className="tabular-nums">{formatInr(amount.value)}</span>;
}
