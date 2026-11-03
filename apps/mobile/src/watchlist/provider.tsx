import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { IpoSummary, WatchlistItem } from "@ipo-singh/contracts";
import type { AuthResult } from "../auth/session";
import { useAuth } from "../auth/provider";
import { clearWatchlistCache, readWatchlistCache, writeWatchlistCache } from "./cache";
import { createWatchlistController, type WatchlistController } from "./controller";
import { watchlistStatusMessage } from "./list";

type WatchlistStatus = "loading" | "guest" | "offline" | "ready" | "error";

type WatchlistModel = {
  userId: string | null;
  status: WatchlistStatus;
  items: WatchlistItem[];
  notice: string | null;
  refreshing: boolean;
};

type WatchlistContextValue = {
  status: WatchlistStatus;
  items: WatchlistItem[];
  notice: string | null;
  refreshing: boolean;
  saved: (ipoId: string) => boolean;
  reload: () => Promise<void>;
  toggle: (ipo: IpoSummary) => Promise<string | null>;
  remove: (ipoId: string) => Promise<string | null>;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

function resultMessage(result: AuthResult<unknown>): string | undefined {
  return "message" in result ? result.message : undefined;
}

function listStatus(status: AuthResult<unknown>["status"], items: readonly WatchlistItem[]): WatchlistStatus {
  if (status === "ready") return "ready";
  if (status === "signed-out") return "guest";
  if (status === "offline") return items.length > 0 ? "ready" : "offline";
  return items.length > 0 ? "ready" : "error";
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const callerRef = useRef(auth.call);
  const phase = auth.state.phase;
  const userId = phase === "ready" ? auth.state.snapshot.account.id : null;
  const controllerRef = useRef<WatchlistController | null>(null);
  const userRef = useRef<string | null>(null);

  const [attempt, setAttempt] = useState(0);
  const [model, setModel] = useState<WatchlistModel>({ userId: null, status: "loading", items: [], notice: null, refreshing: false });

  useEffect(() => {
    callerRef.current = auth.call;
  }, [auth.call]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      if (!userId) {
        if (userRef.current) {
          await clearWatchlistCache(userRef.current).catch(() => undefined);
        }
        userRef.current = null;
        controllerRef.current = null;
      } else if (userRef.current !== userId) {
        userRef.current = userId;
        controllerRef.current = createWatchlistController((input) => callerRef.current(input));
      }
      const controller = controllerRef.current;
      if (!userId || !controller) {
        if (phase === "offline") {
          setModel((current) => ({
            userId: null,
            status: current.items.length > 0 ? "ready" : "offline",
            items: current.items,
            notice: "The watchlist could not be loaded while offline.",
            refreshing: false,
          }));
          return;
        }
        setModel({
          userId: null,
          status: phase === "loading" ? "loading" : "guest",
          items: [],
          notice: null,
          refreshing: false,
        });
        return;
      }

      const cached = await readWatchlistCache(userId).catch(() => null);
      if (!active || userRef.current !== userId) return;
      if (cached && cached.length > 0) {
        setModel({
          userId,
          status: "ready",
          items: cached,
          notice: null,
          refreshing: true,
        });
      }

      const result = await controller.load();
      if (!active || userRef.current !== userId) return;
      if (result.status === "ready") {
        const items = controller.items();
        await writeWatchlistCache(userId, items).catch(() => undefined);
        setModel({
          userId,
          status: "ready",
          items,
          notice: null,
          refreshing: false,
        });
        return;
      }
      if (result.status === "offline" || result.status === "unavailable" || result.status === "rejected" || result.status === "limited") {
        const items = cached ?? controller.items();
        if (items.length > 0) {
          setModel({
            userId,
            status: "ready",
            items,
            notice: watchlistStatusMessage(result.status, "load", resultMessage(result)) ?? "Showing the last saved watchlist on this device.",
            refreshing: false,
          });
          return;
        }
      }
      const items = controller.items();
      setModel({
        userId,
        status: listStatus(result.status, items),
        items,
        notice: watchlistStatusMessage(result.status, "load", resultMessage(result)),
        refreshing: false,
      });
    })();
    return () => {
      active = false;
    };
  }, [attempt, phase, userId]);

  const value = useMemo<WatchlistContextValue>(() => {
    const status: WatchlistStatus = phase === "loading" || (userId !== null && model.userId !== userId)
      ? "loading"
      : !userId && phase === "offline"
        ? (model.items.length > 0 ? "ready" : "offline")
        : !userId
          ? "guest"
          : model.status;

    async function apply(owner: string, controller: WatchlistController, result: AuthResult<unknown>, action: "load" | "change"): Promise<string | null> {
      const message = watchlistStatusMessage(result.status, action, resultMessage(result));
      if (userRef.current !== owner) return message;
      const items = controller.items();
      if (result.status === "ready") {
        await writeWatchlistCache(owner, items).catch(() => undefined);
      }
      setModel({
        userId: owner,
        status: listStatus(result.status, items),
        items,
        notice: message,
        refreshing: false,
      });
      return message;
    }

    return {
      status,
      items: status === "guest" || status === "loading" ? [] : model.items,
      notice: status === "guest" || status === "loading" ? null : model.notice,
      refreshing: model.refreshing,
      saved(ipoId) {
        if (userId && model.userId !== userId) return false;
        if (status !== "ready") return false;
        return model.items.some((item) => item.ipoId === ipoId);
      },
      async reload() {
        const controller = controllerRef.current;
        const owner = userRef.current;
        if (!controller || !owner) {
          setAttempt((current) => current + 1);
          return;
        }
        setModel((current) => ({ ...current, refreshing: true }));
        await apply(owner, controller, await controller.load(), "load");
      },
      async toggle(ipo) {
        const controller = controllerRef.current;
        const owner = userRef.current;
        if (!controller || !owner) {
          if (phase === "offline") return watchlistStatusMessage("offline", "change");
          if (phase === "loading") return "The account is still loading.";
          return watchlistStatusMessage("signed-out", "change");
        }
        return apply(owner, controller, await controller.toggle(ipo, new Date()), "change");
      },
      async remove(ipoId) {
        const controller = controllerRef.current;
        const owner = userRef.current;
        if (!controller || !owner) {
          if (phase === "offline") return watchlistStatusMessage("offline", "change");
          if (phase === "loading") return "The account is still loading.";
          return watchlistStatusMessage("signed-out", "change");
        }
        return apply(owner, controller, await controller.remove(ipoId), "change");
      },
    };
  }, [model, phase, userId]);

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const value = useContext(WatchlistContext);
  if (!value) throw new Error("Watchlist is unavailable.");
  return value;
}
