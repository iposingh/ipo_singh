import Link from "next/link";
import type { CalendarEntry } from "@ipo-singh/contracts";
import { formatInr } from "@ipo-singh/core";
import { SubscriptionMultiple } from "@/components/financial/subscription-multiple";
import { IpoGuruCreditLink } from "@/features/ipo-details/source-credit-link";
import { isIpoGuruSource } from "@/features/ipo-details/source-credit";
import { BoardBadge, IndiaDate, StatusBadge } from "@/features/ipos/ipo-facts";

const eventLabel: Record<CalendarEntry["event"], string> = {
  open: "Opening",
  close: "Closing",
  allotment: "Allotment",
  listing: "Listing",
};

export function CalendarList({ entries, credit = true }: { entries: readonly CalendarEntry[]; credit?: boolean }) {
  const showCredit = credit && entries.some((entry) => isIpoGuruSource(entry.ipo.provenance.sourceName));
  const groups: { date: string; entries: CalendarEntry[] }[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.date}:${entry.event}:${entry.ipo.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const current = groups[groups.length - 1];
    if (current && current.date === entry.date) current.entries.push(entry);
    else groups.push({ date: entry.date, entries: [entry] });
  }

  if (groups.length === 0) {
    return <p className="text-sm text-muted">No stored events match these filters.</p>;
  }

  return (
    <div className="grid gap-6">
      {showCredit ? (
        <p className="text-sm text-muted">
          <IpoGuruCreditLink />
        </p>
      ) : null}
      {groups.map((group) => (
        <section key={group.date} className="grid gap-2">
          <h2 className="text-base font-semibold">
            <IndiaDate value={group.date} />
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
            {group.entries.map((entry) => (
              <li key={`${entry.date}:${entry.event}:${entry.ipo.slug}`} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="grid min-w-0 gap-1">
                  <Link href={`/ipos/${entry.ipo.slug}`} className="font-medium underline-offset-2 hover:underline">
                    {entry.ipo.companyName}
                  </Link>
                  <p className="text-sm text-muted">
                    {eventLabel[entry.event]} · GMP {formatInr(entry.ipo.gmpAmountRupees)} · Subscription{" "}
                    <SubscriptionMultiple value={entry.ipo.subscriptionTotalTimes} />
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <BoardBadge board={entry.ipo.board} />
                  <StatusBadge status={entry.ipo.status} allotmentConfirmed={entry.ipo.allotmentConfirmed} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
