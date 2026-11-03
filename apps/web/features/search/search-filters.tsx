"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { searchPath, type SearchFilters } from "./query";

const boardOptions = [
  { value: "all", label: "All boards" },
  { value: "mainboard", label: "Mainboard" },
  { value: "sme", label: "SME" },
] as const;

const statusOptions = [
  { value: "all", label: "Any status" },
  { value: "upcoming", label: "Upcoming" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "allotment", label: "Allotment" },
  { value: "listed", label: "Listed" },
] as const;

export function SearchFilters({ filters }: { filters: SearchFilters }) {
  const router = useRouter();

  function applyDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get("from") ?? "").trim();
    const to = String(data.get("to") ?? "").trim();
    router.push(
      searchPath({
        ...filters,
        from: from || null,
        to: to || null,
        cursor: null,
      }),
    );
  }

  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Board</legend>
        <div className="flex flex-wrap gap-2">
          {boardOptions.map((option) => (
            <FilterLink
              key={option.value}
              href={searchPath({ ...filters, board: option.value, cursor: null })}
              current={filters.board === option.value}
            >
              {option.label}
            </FilterLink>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Status</legend>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((option) => (
            <FilterLink
              key={option.value}
              href={searchPath({ ...filters, status: option.value, cursor: null })}
              current={filters.status === option.value}
            >
              {option.label}
            </FilterLink>
          ))}
        </div>
        <p className="text-sm text-muted">Closed also includes issues whose status is allotment.</p>
      </fieldset>
      <form action="/search" method="get" onSubmit={applyDates} className="grid gap-3">
        {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
        {filters.board !== "all" ? <input type="hidden" name="board" value={filters.board} /> : null}
        {filters.status !== "all" ? <input type="hidden" name="status" value={filters.status} /> : null}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-1.5">
            <label htmlFor="search-from" className="text-sm font-medium">
              From
            </label>
            <input
              id="search-from"
              name="from"
              type="date"
              defaultValue={filters.from ?? ""}
              className="h-11 rounded-control border border-border bg-surface px-3 text-base text-foreground"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="search-to" className="text-sm font-medium">
              To
            </label>
            <input
              id="search-to"
              name="to"
              type="date"
              defaultValue={filters.to ?? ""}
              className="h-11 rounded-control border border-border bg-surface px-3 text-base text-foreground"
            />
          </div>
          <Button type="submit" variant="secondary">
            Apply dates
          </Button>
        </div>
        <p className="text-sm text-muted">
          An issue matches when a stored open, close, or listing date falls in this range. Allotment dates are not used. An issue with none of those dates stays out of the range.
        </p>
        {filters.from || filters.to ? (
          <Link href={searchPath({ ...filters, from: null, to: null, cursor: null })} className="text-sm text-link underline">
            Clear dates
          </Link>
        ) : null}
      </form>
    </div>
  );
}

function FilterLink({ href, current, children }: { href: string; current: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={current ? "true" : undefined}
      className={cn(
        "inline-flex h-10 items-center rounded-control border px-3 text-sm",
        current ? "border-primary-solid bg-primary-solid text-primary-foreground" : "border-border bg-surface text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
