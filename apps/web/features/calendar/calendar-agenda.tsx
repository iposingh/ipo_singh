import Link from "next/link";
import type { CalendarEntry } from "@ipo-singh/contracts";
import { formatInr } from "@ipo-singh/core";
import { SubscriptionMultiple } from "@/components/financial/subscription-multiple";
import { BoardBadge, IndiaDate, StatusBadge } from "@/features/ipos/ipo-facts";

const groupOrder = ["open", "close", "allotment", "listing"] as const;

const groupLabel: Record<CalendarEntry["event"], string> = {
  open: "Opening",
  close: "Closing",
  allotment: "Allotment",
  listing: "Listing",
};

export function CalendarAgenda({ date, entries }: { date: string; entries: readonly CalendarEntry[] }) {
  const groups = groupOrder
    .map((event) => ({ event, entries: entries.filter((entry) => entry.event === event) }))
    .filter((group) => group.entries.length > 0);
  return (
    <section aria-labelledby="calendar-agenda" className="grid gap-4">
      <h2 id="calendar-agenda" className="text-lg font-semibold">
        <IndiaDate value={date} />
      </h2>
      {groups.length === 0 ? (
        <p className="text-sm text-muted">No stored IPO events on this date. Missing dates are not filled in.</p>
      ) : (
        groups.map((group) => (
          <div key={group.event} className="grid gap-2">
            <h3 className="text-sm font-medium text-muted">{groupLabel[group.event]}</h3>
            <ul className="grid gap-2">
              {group.entries.map((entry) => (
                <li key={`${entry.event}:${entry.ipo.slug}`} className="rounded-panel border border-border bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <Link href={`/ipos/${entry.ipo.slug}`} className="font-medium underline-offset-2 hover:underline">
                        {entry.ipo.companyName}
                      </Link>
                      <p className="text-sm text-muted">
                        {groupLabel[entry.event]} · <IndiaDate value={entry.date} />
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <BoardBadge board={entry.ipo.board} />
                      <StatusBadge status={entry.ipo.status} allotmentConfirmed={entry.ipo.allotmentConfirmed} />
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">GMP</dt>
                      <dd className="tabular-nums">{formatInr(entry.ipo.gmpAmountRupees)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Subscription</dt>
                      <dd>
                        <SubscriptionMultiple value={entry.ipo.subscriptionTotalTimes} />
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-sm text-muted">Price band is on the IPO page. It is not part of this calendar record.</p>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
