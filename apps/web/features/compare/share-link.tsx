"use client";

import { useState } from "react";

export function ShareComparison({ path }: { path: string }) {
  const [message, setMessage] = useState("");
  return (
    <form
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const url = new URL(path, window.location.origin).toString();
        void navigator.clipboard.writeText(url).then(
          () => setMessage("Link copied"),
          () => setMessage("Select the address and copy it"),
        );
      }}
    >
      <div className="grid gap-1.5">
        <label htmlFor="compare-link" className="text-sm font-medium">
          Comparison link
        </label>
        <input
          id="compare-link"
          readOnly
          value={path}
          className="h-11 w-full rounded-control border border-border bg-surface px-3 text-base text-foreground"
        />
      </div>
      <button type="submit" className="inline-flex h-11 items-center justify-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground">
        Copy link
      </button>
      {message ? <p className="text-sm text-muted sm:col-span-2">{message}</p> : null}
    </form>
  );
}
