"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { boardLabel, listingLifecycleLabel } from "@/features/ipos/labels";
import { cn } from "@/lib/cn";
import { sanitizeSearchText } from "./query";
import {
  nextSuggestionIndex,
  parseSuggestionResponse,
  shouldRequestSuggestions,
  suggestionRequestKey,
  type SearchSuggestion,
} from "./suggestions";

const debounceMs = 300;

type SearchBoxProps = {
  id: string;
  initialQuery?: string;
  className?: string;
  label?: string;
  labelVisibility?: "visible" | "hidden";
  showSubmit?: boolean;
  placement?: "overlay" | "inline";
  suggestionsEnabled?: boolean;
  board?: string;
  status?: string;
  from?: string;
  to?: string;
  onNavigate?: () => void;
  autoFocus?: boolean;
};

export function SearchBox({
  id,
  initialQuery = "",
  className,
  label = "Search IPOs",
  labelVisibility = "hidden",
  showSubmit = false,
  placement = "overlay",
  suggestionsEnabled = true,
  board = "all",
  status = "all",
  from = "",
  to = "",
  onNavigate,
  autoFocus = false,
}: SearchBoxProps) {
  const router = useRouter();
  const listId = useId();
  const errorId = `${id}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  const completedRef = useRef<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [querySource, setQuerySource] = useState(initialQuery);
  const [rejected, setRejected] = useState(() => sanitizeSearchText(initialQuery).rejected);
  const [items, setItems] = useState<SearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (initialQuery !== querySource) {
    setQuerySource(initialQuery);
    setQuery(initialQuery);
    setRejected(sanitizeSearchText(initialQuery).rejected);
    setItems([]);
    setOpen(false);
    setActive(-1);
    setPending(false);
    setFailed(false);
  }

  useEffect(() => {
    completedRef.current = null;
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      requestRef.current?.abort();
    };
  }, [initialQuery]);

  function closeList() {
    setOpen(false);
    setActive(-1);
  }

  function schedule(nextQuery: string) {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    requestRef.current?.abort();
    const sanitized = sanitizeSearchText(nextQuery);
    if (sanitized.rejected) {
      setRejected(true);
      setItems([]);
      setPending(false);
      setFailed(false);
      closeList();
      return;
    }
    setRejected(false);
    const key = suggestionRequestKey({ q: sanitized.text, board, status, from, to });
    if (!shouldRequestSuggestions(sanitized.text, suggestionsEnabled, key, completedRef.current)) {
      setPending(false);
      if (sanitized.text.length < 2 || !suggestionsEnabled) {
        setItems([]);
        setFailed(false);
        closeList();
      } else {
        setOpen(true);
      }
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setItems([]);
    setActive(-1);
    setPending(true);
    setFailed(false);
    setOpen(true);
    timerRef.current = window.setTimeout(() => {
      void loadSuggestions(sanitized.text, key, controller);
    }, debounceMs);
  }

  async function loadSuggestions(text: string, key: string, controller: AbortController) {
    const params = new URLSearchParams({ q: text });
    if (board !== "all" && board !== "") params.set("board", board);
    if (status !== "all" && status !== "") params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const response = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) throw new Error("unavailable");
      const body: unknown = await response.json();
      if (controller.signal.aborted || requestRef.current !== controller) return;
      const parsed = parseSuggestionResponse(body);
      completedRef.current = key;
      setRejected(parsed.rejected);
      setItems(parsed.rejected ? [] : parsed.items);
      setActive(-1);
      setFailed(false);
      setOpen(!parsed.rejected);
    } catch (error) {
      if (isAbort(error) || controller.signal.aborted || requestRef.current !== controller) return;
      setFailed(true);
      setItems([]);
      setOpen(true);
    } finally {
      if (!controller.signal.aborted && requestRef.current === controller) setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const sanitized = sanitizeSearchText(query);
    if (sanitized.rejected) {
      event.preventDefault();
      setRejected(true);
      return;
    }
    onNavigate?.();
  }

  function openSuggestion(slug: string) {
    onNavigate?.();
    closeList();
    router.push(`/ipos/${slug}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      const selected = open && active >= 0 ? items[active] : undefined;
      if (selected) {
        event.preventDefault();
        openSuggestion(selected.slug);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      closeList();
      return;
    }
    if (!open || items.length === 0) return;
    const next = nextSuggestionIndex(active, event.key, items.length);
    if (next === "unchanged" || next === "submit" || next === "close") return;
    event.preventDefault();
    setActive(next);
    document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
  }

  const activeId = active >= 0 ? `${listId}-${active}` : undefined;
  return (
    <form action="/search" method="get" role="search" onSubmit={onSubmit} className={cn("relative min-w-0", className)}>
      <div className={cn("grid gap-3", showSubmit && "sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end")}>
        <div className="grid gap-1.5">
          <label htmlFor={id} className={labelVisibility === "visible" ? "text-sm font-medium" : "sr-only"}>
            {label}
          </label>
          <input
            ref={inputRef}
            id={id}
            name="q"
            type="search"
            role="combobox"
            placeholder="Search company or symbol"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            enterKeyHint="search"
            spellCheck={false}
            autoFocus={autoFocus}
            value={query}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={activeId}
            aria-busy={pending}
            aria-invalid={rejected}
            aria-describedby={rejected ? errorId : undefined}
            aria-haspopup="listbox"
            onChange={(event) => {
              setQuery(event.target.value);
              schedule(event.target.value);
            }}
            onKeyDown={onKeyDown}
            className="h-11 w-full rounded-control border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted"
          />
        </div>
        {showSubmit ? (
          <Button type="submit" className="w-full sm:w-auto">
            Search
          </Button>
        ) : null}
      </div>
      {board !== "all" && board !== "" ? <input type="hidden" name="board" value={board} /> : null}
      {status !== "all" && status !== "" ? <input type="hidden" name="status" value={status} /> : null}
      {from ? <input type="hidden" name="from" value={from} /> : null}
      {to ? <input type="hidden" name="to" value={to} /> : null}
      {rejected ? (
        <p id={errorId} className="mt-2 text-sm text-negative-text">
          Search text cannot include angle brackets or control characters.
        </p>
      ) : null}
      {open ? (
        <div
          id={items.length > 0 ? undefined : listId}
          className={cn(
            "z-40 max-h-80 overflow-y-auto rounded-control border border-border bg-surface shadow-card",
            placement === "overlay" ? "absolute top-full right-0 left-0 mt-1" : "mt-2",
          )}
        >
          {pending ? (
            <p role="status" className="px-3 py-2 text-sm text-muted">
              Searching stored issues
            </p>
          ) : null}
          {failed ? (
            <p role="status" className="px-3 py-2 text-sm text-muted">
              Suggestions could not be loaded. The search can still be submitted.
            </p>
          ) : null}
          {!pending && !failed && items.length === 0 ? (
            <p role="status" className="px-3 py-2 text-sm text-muted">
              No stored IPO matches.
            </p>
          ) : null}
          {items.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Matching stored IPOs" onMouseDown={(event) => event.preventDefault()}>
              {items.map((item, index) => (
                <li key={item.slug} role="presentation">
                  <Link
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    href={`/ipos/${item.slug}`}
                    onClick={() => onNavigate?.()}
                    className={cn(
                      "flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm",
                      index === active ? "bg-background" : "hover:bg-background",
                    )}
                  >
                    <span>{item.companyName}</span>
                    <span className="shrink-0 text-muted">
                      {boardLabel(item.board)},{" "}
                      {listingLifecycleLabel({ status: item.status, allotmentConfirmed: item.allotmentConfirmed })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
