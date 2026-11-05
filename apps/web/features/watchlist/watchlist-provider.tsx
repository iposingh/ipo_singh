"use client";

import { watchlistItemSchema, watchlistResponseSchema, type WatchlistItem } from "@ipo-singh/contracts";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { hasBrowserAuthHint } from "@/features/auth/browser-auth-hint";
import { readCsrfToken } from "@/features/auth/csrf";

type WatchlistStatus = "loading" | "guest" | "ready" | "error";

type WatchlistContextValue = {
  status: WatchlistStatus;
  items: readonly WatchlistItem[];
  reload: () => Promise<void>;
  toggle: (ipoId: string) => Promise<"saved" | "removed" | "guest" | "error">;
  saveNote: (ipoId: string, note: string | null) => Promise<boolean>;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

function csrfHeaders(): Headers {
  const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
  const csrf = readCsrfToken(document.cookie);
  if (csrf) headers.set("x-csrf-token", csrf);
  return headers;
}

async function readItems(): Promise<{ status: "guest" | "error" } | { status: "ready"; items: WatchlistItem[] }> {
  // Guests have no readable CSRF cookie; avoid a guaranteed 401 on every page load.
  if (!hasBrowserAuthHint()) return { status: "guest" };
  let response = await fetch("/api/watchlist", { headers: { accept: "application/json" }, cache: "no-store" });
  if (response.status === 401 && readCsrfToken(document.cookie)) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", headers: csrfHeaders(), cache: "no-store" });
    if (refreshed.ok) response = await fetch("/api/watchlist", { headers: { accept: "application/json" }, cache: "no-store" });
  }
  if (response.status === 401) return { status: "guest" };
  const parsed = watchlistResponseSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) return { status: "error" };
  return { status: "ready", items: parsed.data.items };
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WatchlistStatus>("loading");
  const [items, setItems] = useState<WatchlistItem[]>([]);

  async function reload() {
    try {
      const next = await readItems();
      if (next.status !== "ready") {
        setStatus(next.status);
        setItems([]);
        return;
      }
      setItems(next.items);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void readItems()
      .then((next) => {
        if (cancelled) return;
        if (next.status !== "ready") {
          setStatus(next.status);
          return;
        }
        setItems(next.items);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(ipoId: string): Promise<"saved" | "removed" | "guest" | "error"> {
    if (status === "guest") return "guest";
    const saved = items.some((item) => item.ipoId === ipoId);
    try {
      const response = await fetch(saved ? `/api/watchlist/${ipoId}` : "/api/watchlist", {
        method: saved ? "DELETE" : "POST",
        headers: csrfHeaders(),
        body: saved ? undefined : JSON.stringify({ ipoId }),
      });
      if (response.status === 401) {
        setStatus("guest");
        setItems([]);
        return "guest";
      }
      if (saved) {
        if (response.status !== 204) return "error";
        setItems((current) => current.filter((item) => item.ipoId !== ipoId));
        return "removed";
      }
      const parsed = watchlistItemSchema.safeParse(await response.json().catch(() => null));
      if (!response.ok || !parsed.success) return "error";
      setItems((current) => [parsed.data, ...current.filter((item) => item.ipoId !== parsed.data.ipoId)]);
      setStatus("ready");
      return "saved";
    } catch {
      return "error";
    }
  }

  async function saveNote(ipoId: string, note: string | null): Promise<boolean> {
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ ipoId, note }),
      });
      const parsed = watchlistItemSchema.safeParse(await response.json().catch(() => null));
      if (!response.ok || !parsed.success) return false;
      setItems((current) => current.map((item) => (item.ipoId === ipoId ? parsed.data : item)));
      return true;
    } catch {
      return false;
    }
  }

  return <WatchlistContext.Provider value={{ status, items, reload, toggle, saveNote }}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const value = useContext(WatchlistContext);
  if (!value) throw new Error("useWatchlist must be used within WatchlistProvider");
  return value;
}
