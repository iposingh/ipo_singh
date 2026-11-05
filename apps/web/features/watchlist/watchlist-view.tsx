"use client";

import { accountSessionResponseSchema, defaultAccountPreferences, type AccountPreferences, type WatchlistItem } from "@ipo-singh/contracts";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { InrPrice } from "@/components/financial/inr-price";
import { SubscriptionMultiple } from "@/components/financial/subscription-multiple";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { BoardBadge, IndiaDate, StatusBadge } from "@/features/ipos/ipo-facts";
import { useWatchlist } from "@/features/watchlist/watchlist-provider";

const filters = [
  { id: "all", label: "All" },
  { id: "mainboard", label: "Mainboard" },
  { id: "sme", label: "SME" },
] as const;

type BoardFilter = (typeof filters)[number]["id"];

export function WatchlistView() {
  const { status, items, reload, toggle, saveNote } = useWatchlist();
  const [board, setBoard] = useState<BoardFilter>("all");
  const [display, setDisplay] = useState<AccountPreferences["watchlistDisplay"]>(defaultAccountPreferences.watchlistDisplay);
  const boardChosen = useRef(false);

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    void fetch("/api/auth/session", { headers: { accept: "application/json" }, cache: "no-store" })
      .then((response) => response.json())
      .then((body: unknown) => {
        const parsed = accountSessionResponseSchema.safeParse(body);
        if (!parsed.success || cancelled) return;
        setDisplay(parsed.data.account.preferences.watchlistDisplay);
        const preferred = parsed.data.account.preferences.defaultBoard;
        if (!boardChosen.current && preferred) setBoard(preferred);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status]);
  const visible = items.filter((item) => {
    if (board === "all") return true;
    return item.ipo?.board === board;
  });

  if (status === "loading") return <LoadingState label="Loading your watchlist" />;
  if (status === "error") {
    return <ErrorState title="Watchlist unavailable" message="Your saved issues could not be loaded." action={<Button type="button" onClick={() => void reload()}>Try again</Button>} />;
  }
  if (status === "guest") {
    return (
      <Card className="grid gap-4">
        <p className="text-sm leading-6 text-muted">Sign in to save IPO issues and open the same watchlist from another session. Browsing stays open without an account.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login" className="inline-flex h-11 items-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground">
            Sign in
          </Link>
          <Link href="/register" className="inline-flex h-11 items-center rounded-control border border-border px-4 text-sm font-medium text-foreground">
            Create an account
          </Link>
        </div>
      </Card>
    );
  }
  if (items.length === 0) {
    return <EmptyState title="No saved issues yet" description="Use Save on an IPO card or IPO page. The watchlist stores the IPO id, then reads the current catalogue." />;
  }

  return (
    <div className={display.density === "compact" ? "grid gap-3" : "grid gap-4"}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="IPO category">
        {filters.map((filter) => (
          <Button
            key={filter.id}
            type="button"
            variant={board === filter.id ? "primary" : "secondary"}
            aria-pressed={board === filter.id}
            onClick={() => {
              boardChosen.current = true;
              setBoard(filter.id);
            }}
          >
            {filter.label}
          </Button>
        ))}
      </div>
      {visible.length === 0 ? (
        <EmptyState title={`No saved ${board === "sme" ? "SME" : "Mainboard"} issues`} description="Saved issues from the other category stay on All." />
      ) : (
        <ul className={display.density === "compact" ? "grid gap-2" : "grid gap-4"}>
          {visible.map((item) => (
            <li key={item.ipoId}>
              <WatchlistRow item={item} showDates={display.showDates} showGmp={display.showGmp} showSubscription={display.showSubscription} onRemove={() => void toggle(item.ipoId)} onNote={(note) => saveNote(item.ipoId, note)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WatchlistRow({
  item,
  showDates,
  showGmp,
  showSubscription,
  onRemove,
  onNote,
}: {
  item: WatchlistItem;
  showDates: boolean;
  showGmp: boolean;
  showSubscription: boolean;
  onRemove: () => void;
  onNote: (note: string | null) => Promise<boolean>;
}) {
  const [note, setNote] = useState(item.note ?? "");
  const [noteMessage, setNoteMessage] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ipo = item.ipo;

  return (
    <Card className="grid gap-3">
      {ipo ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-2">
            <h2 className="text-lg font-semibold">
              <Link href={`/ipos/${ipo.slug}`} prefetch={false} className="underline-offset-2 hover:underline">
                {ipo.companyName}
              </Link>
            </h2>
            <div className="flex flex-wrap gap-2">
              <BoardBadge board={ipo.board} />
              <StatusBadge status={ipo.status} allotmentConfirmed={ipo.allotmentConfirmed} />
            </div>
          </div>
          <Button type="button" variant="secondary" onClick={onRemove}>
            Remove
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">This IPO is no longer stored</h2>
            <p className="text-sm text-muted">The saved id remains until you remove it. No company or price is invented.</p>
          </div>
          <Button type="button" variant="secondary" onClick={onRemove}>
            Remove
          </Button>
        </div>
      )}
      {ipo && (showDates || showGmp || showSubscription) ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {showDates ? (
            <>
              <div>
                <dt className="text-muted">Opens</dt>
                <dd><IndiaDate value={ipo.openDate} /></dd>
              </div>
              <div>
                <dt className="text-muted">Closes</dt>
                <dd><IndiaDate value={ipo.closeDate} /></dd>
              </div>
            </>
          ) : null}
          {showGmp ? (
            <div>
              <dt className="text-muted">GMP</dt>
              <dd><InrPrice value={ipo.gmpAmountRupees} /></dd>
            </div>
          ) : null}
          {showSubscription ? (
            <div>
              <dt className="text-muted">Subscription</dt>
              <dd><SubscriptionMultiple value={ipo.subscriptionTotalTimes} /></dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {ipo ? (
        <form
          className="grid gap-2"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setNoteError(null);
            setNoteMessage(null);
            void onNote(note.trim() === "" ? null : note.trim()).then((ok) => {
              if (ok) setNoteMessage("Note saved.");
              else setNoteError("The note could not be saved.");
              setBusy(false);
            });
          }}
        >
          <Input id={`note-${item.ipoId}`} label="Note" value={note} maxLength={280} hint="Optional. This stays with the saved IPO id." onChange={(event) => setNote(event.target.value)} />
          {noteError ? <p role="alert" className="text-sm text-negative-text">{noteError}</p> : null}
          {noteMessage ? <p role="status" className="text-sm text-foreground">{noteMessage}</p> : null}
          <Button type="submit" variant="secondary" loading={busy}>
            {busy ? "Saving note" : "Save note"}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
