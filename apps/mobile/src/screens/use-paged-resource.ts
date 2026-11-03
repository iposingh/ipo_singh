import { useCallback, useEffect, useRef, useState } from "react";
import { MobileApiError, apiFailureMessage } from "../api/errors";
import { pageFailureMessage, type PageResult } from "../catalogue/load";
import { useOnReconnect } from "../network/provider";

export type PagedState<T> =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; items: T[]; nextCursor: string | null; loadingMore: boolean; moreError: string | null };

export function usePagedResource<T>(
  load: (cursor: string | undefined, signal: AbortSignal) => Promise<PageResult<T>>,
  reloadKey: string,
  enabled: boolean,
): {
  state: PagedState<T>;
  reload: () => void;
  loadMore: () => void;
  reset: () => void;
} {
  const loadRef = useRef(load);
  const requestId = useRef(0);
  const softRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PagedState<T>>({ phase: enabled ? "loading" : "idle" });

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!enabled) return;
    const id = requestId.current + 1;
    requestId.current = id;
    const soft = softRef.current;
    softRef.current = false;
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted || id !== requestId.current) return;
      if (!soft) setState({ phase: "loading" });
      try {
        const result = await loadRef.current(undefined, controller.signal);
        if (controller.signal.aborted || id !== requestId.current) return;
        if (result.status === "ready") {
          setState({ phase: "ready", items: result.items, nextCursor: result.nextCursor, loadingMore: false, moreError: null });
          return;
        }
        if (soft) {
          setState((current) => (current.phase === "ready" ? current : { phase: "error", message: pageFailureMessage(result) }));
          return;
        }
        setState({ phase: "error", message: pageFailureMessage(result) });
      } catch (error) {
        if (controller.signal.aborted || id !== requestId.current) return;
        if (error instanceof MobileApiError && error.kind === "cancelled") return;
        if (soft) {
          setState((current) => (current.phase === "ready" ? current : { phase: "error", message: apiFailureMessage.network }));
          return;
        }
        setState({ phase: "error", message: apiFailureMessage.network });
      }
    })();
    return () => controller.abort();
  }, [attempt, enabled, reloadKey]);

  function reload() {
    setState({ phase: "loading" });
    setAttempt((value) => value + 1);
  }

  const softReload = useCallback(() => {
    if (!enabled) return;
    softRef.current = true;
    setAttempt((value) => value + 1);
  }, [enabled]);

  useOnReconnect(softReload);

  function reset() {
    requestId.current += 1;
    setState({ phase: "idle" });
  }

  function loadMore() {
    if (state.phase !== "ready" || !state.nextCursor || state.loadingMore) return;
    const cursor = state.nextCursor;
    const id = requestId.current;
    setState({ ...state, loadingMore: true, moreError: null });
    void (async () => {
      try {
        const result = await loadRef.current(cursor, new AbortController().signal);
        if (id !== requestId.current) return;
        setState((current) => {
          if (current.phase !== "ready") return current;
          if (result.status !== "ready") return { ...current, loadingMore: false, moreError: pageFailureMessage(result) };
          return { phase: "ready", items: [...current.items, ...result.items], nextCursor: result.nextCursor, loadingMore: false, moreError: null };
        });
      } catch {
        if (id !== requestId.current) return;
        setState((current) => (current.phase === "ready" ? { ...current, loadingMore: false, moreError: apiFailureMessage.network } : current));
      }
    })();
  }

  return { state, reload, loadMore, reset };
}
